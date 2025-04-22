/**
 * Performant data stream classes for inter-thread communication.
 */

/**
 * Our best estimate of the cache line size (in bytes) on most platforms.
 */
const kCacheLineSize = 64;

/**
 * An abstraction of 32-bit atomic variable on top of a `SharedArrayBuffer`.
 */
class Atomic {
  private array: Int32Array;

  constructor(buffer: SharedArrayBuffer, byteOffset: number) {
    this.array = new Int32Array(buffer, byteOffset, 1);
  }

  public load() {
    return Atomics.load(this.array, 0);
  }

  public store(value: number) {
    Atomics.store(this.array, 0, value);
  }
}

/**
 * A SPSC byte stream supporting contiguous reservations, as described by this blog post:
 * https://ferrous-systems.com/blog/lock-free-ring-buffer/.
 *
 * This implementation is based off of the Rust one given here:
 * https://github.com/utaal/spsc-bip-buffer/blob/master/src/lib.rs.
 *
 * This is the base class which sets up some shared state/methods. To read from or write to
 * the stream, instantiate the relevant subclass.
 */
export class Stream {
  /**
   * Creates a `SharedArrayBuffer` with its metadata already set.
   * @param capacity The stream capacity in bytes.
   * @returns A `SharedArrayBuffer` that can be used to construct stream readers/writers.
   */
  public static createBuffer(capacity: number): SharedArrayBuffer {
    const buffer = new SharedArrayBuffer(3 * kCacheLineSize + capacity + 1);
    const stream = new Stream(buffer);
    stream.atm_read.store(0);
    stream.atm_write.store(0);
    stream.atm_last.store(stream.len);
    return buffer;
  }

  /**
   * The current index of the read head. This is where the next byte will be read.
   * This will ONLY be updated by the reader.
   */
  protected atm_read: Atomic;

  /**
   * The current index of the write head. This is where the next byte will be written.
   * This will ONLY be updated by the writer.
   */
  protected atm_write: Atomic;

  /**
   * The index of the first invalid byte in the buffer.
   * This will ONLY be updated by the writer.
   */
  protected atm_last: Atomic;

  /**
   * A view over the data region where bytes will be read/written.
   */
  protected data: Uint8Array;

  protected constructor(buffer: SharedArrayBuffer) {
    const minBytes = 3 * kCacheLineSize;
    if (buffer.byteLength <= minBytes) {
      throw new Error(`Shared array buffer must have strictly more than ${minBytes} bytes`);
    }

    // We offset metadata by the cache line size as an attempt to avoid false sharing when using
    // atomic operations
    this.atm_read = new Atomic(buffer, 0 * kCacheLineSize);
    this.atm_write = new Atomic(buffer, 1 * kCacheLineSize);
    this.atm_last = new Atomic(buffer, 2 * kCacheLineSize);
    this.data = new Uint8Array(buffer, 3 * kCacheLineSize);
  }

  /**
   * The stream's capacity in bytes
   */
  public get capacity() {
    return this.data.byteLength - 1;
  }

  /**
   * The stream buffer's actual total capacity in bytes.
   */
  protected get len() {
    return this.data.byteLength;
  }
}

export class StreamWriterReservation {
  private commited?: boolean;

  constructor(
    private readonly writer: StreamWriter,
    public readonly data: Uint8Array,
    public readonly wraparound?: boolean,
  ) {}

  /**
   * Commits this reservation to the underlying writer.
   */
  commit() {
    if (this.commited) return;
    this.commited = true;
    this.writer.commit(this);
  }

  /**
   * Gets a `DataView` over the contents of this reservation's data.
   */
  get view() {
    return new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
  }
}

export class StreamWriter extends Stream {
  private write: number;
  private last: number;
  private _bytesWritten = 0;

  public constructor(buffer: SharedArrayBuffer) {
    super(buffer);
    this.write = this.atm_write.load();
    this.last = this.atm_last.load();
  }

  /**
   * Gets the number of bytes written to the stream over the lifetime of this writer
   */
  public get bytesWritten() {
    return this._bytesWritten;
  }

  /**
   * Requests a contiguous reservation for writing.
   * @param count The number of bytes to be written. Must be less than or equal to `capacity`.
   * @returns A `StreamWriterReservation` if an allocation was possible, otherwise `null`.
   *
   * This method makes no changes to the shared state. For the writes to be visible, you must call
   * `commit()` afterwards with the returned reservation.
   *
   * This method does not block or spin.
   */
  reserve(count: number): StreamWriterReservation | null {
    if (count < 1 || count > this.capacity) {
      throw new Error(`Can't reserve ${count} bytes. Capacity is ${this.capacity}`);
    }

    const read = this.atm_read.load();
    if (this.write >= read) {
      if (this.len - this.write >= count) {
        return new StreamWriterReservation(
          this,
          this.data.subarray(this.write, this.write + count),
        );
      } else {
        if (read - 1 >= count) {
          return new StreamWriterReservation(this, this.data.subarray(0, count), true);
        } else {
          return null;
        }
      }
    } else {
      if (read - this.write - 1 >= count) {
        return new StreamWriterReservation(
          this,
          this.data.subarray(this.write, this.write + count),
        );
      } else {
        return null;
      }
    }
  }

  /**
   * Commits a reservation that will be available for the reader to read.
   * @param reservation The reservation to commit
   */
  commit(reservation: StreamWriterReservation): void {
    if (reservation.wraparound) {
      this.atm_last.store(this.write);
      this.write = 0;
    }

    this.write += reservation.data.length;
    if (this.write > this.last) {
      this.last = this.write;
      this.atm_last.store(this.last);
    }

    this.atm_write.store(this.write);
    this._bytesWritten += reservation.data.length;
  }
}

export class StreamReader extends Stream {
  private read: number;
  private priv_write: number;
  private priv_last: number;
  private _bytesRead = 0;

  public constructor(buffer: SharedArrayBuffer) {
    super(buffer);
    this.read = this.atm_read.load();
    this.priv_write = this.atm_write.load();
    this.priv_last = this.atm_last.load();
  }

  /**
   * Gets the number of bytes read from the stream over the lifetime of this writer
   */
  public get bytesRead() {
    return this._bytesRead;
  }

  /**
   * Gets the read buffer, that is, a view over all of the valid bytes available to be read.
   *
   * @returns A view over the readable bytes in the stream.
   *          There are no guarantees on the size of the returned buffer other
   *          than that it will be less than or equal to the buffer capacity.
   *
   * This method makes no changes to the shared state. For the reads to be visible, you must call
   * `commit()` afterwards with the number of bytes read.
   *
   * This method does not block or spin.
   */
  valid(): Uint8Array {
    this.priv_write = this.atm_write.load();
    if (this.priv_write >= this.read) {
      return this.data.subarray(this.read, this.priv_write);
    } else {
      this.priv_last = this.atm_last.load();
      if (this.read === this.priv_last) {
        this.read = 0;
        return this.valid();
      }

      return this.data.subarray(this.read, this.priv_last);
    }
  }

  /**
   * Commits `count` bytes as having been read from the buffer.
   * @param count The number of bytes read. Must be less than or equal to `capacity`.
   *
   * `count` must be less than or equal to the size of the last buffer returned by `read()`
   * to avoid clobbering written data. This method may throw if it is not.
   */
  consume(count: number): void {
    if (this.priv_write >= this.read) {
      if (count <= this.priv_write - this.read) {
        this.read += count;
      } else {
        throw new Error(`Couldn't consume ${count} bytes`);
      }
    } else {
      let remaining = this.priv_last - this.read;
      if (count === remaining) {
        this.read = 0;
      } else if (count <= remaining) {
        this.read += count;
      } else {
        throw new Error(`Couldn't consume ${count} bytes`);
      }
    }
    this.atm_read.store(this.read);
    this._bytesRead += count;
  }
}

/**
 * Represents a spin lock stategy for how to wait on a spin lock.
 * By default, this lock busy waits. However, subclasses can change this strategy.
 */
class SpinLockStrategy {
  /**
   * Resets the state of the locking strategy.
   * This will be called before a consumer of the lock begins locking.
   */
  public reset(): void {}

  /**
   * Called on every spin.
   * @returns The number of milliseconds to sleep.
   *          In synchronous contexts, anything other than 0 will cause the waiting thread to go to sleep.
   *          In asynchronous contexts, anything other than 0 will cause the thread to await a timeout.
   */
  public spin(): number { return 0; }
}
