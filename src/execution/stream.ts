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

  constructor(buffer?: SharedArrayBuffer, byteOffset?: number) {
    buffer ??= new SharedArrayBuffer(4);
    this.array = new Int32Array(buffer, byteOffset, 1);
  }

  public load() {
    return Atomics.load(this.array, 0);
  }

  public store(value: number) {
    Atomics.store(this.array, 0, value);
  }

  public sleep(old: number, timeoutMs?: number) {
    Atomics.wait(this.array, 0, old, timeoutMs);
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
   * Creates a `SharedArrayBuffer` for use with streaming data.
   * @param capacity The stream capacity in bytes, excluding metadata.
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
   *
   * @param count     The number of bytes to be written. Must be positive.
   *                  If `flexible` is not `true`, can be at most `Math.ceil(capacity / 2)` to avoid deadlock.
   *
   * @param flexible  Whether the reservation is flexible (i.e. it may contain fewer than the number of bytes requested).
   *                  Flexible reservations will never be empty.
   *                  When writing a variable sized allocation, you should set this this to `true` and handle fragmentation yourself.
   *
   * @returns         A `StreamWriterReservation` if an allocation was possible, otherwise `null`.
   *
   * This method makes no changes to the shared state. For the writes to be visible, you must call
   * `commit()` afterwards with the returned reservation.
   *
   * This method does not block or spin.
   */
  reserve(count: number, flexible?: boolean): StreamWriterReservation | null {
    if (count <= 0) throw new Error(`Cannot request a reservation of ${count} bytes!`);

    if (!flexible && count > this.len / 2) {
      const bound = Math.floor(this.len / 2);
      throw new Error(
        `Requested exactly ${count} bytes.` +
          `\nOn a stream with capacity ${this.capacity}, ` +
          `exact reservations can be at most ${bound} bytes to avoid deadlock.` +
          `\nTo handle the requested reservation, the stream capacity would need to be at least ${
            count * 2 - 1
          } bytes.` +
          `\nSet \`flexible\` to \`true\` to request any available remaining capacity or increase the capacity of the underlying \`SharedArrayBuffer\`.`,
      );
    }

    const read = this.atm_read.load();
    if (this.write >= read) {
      /* Write follows read, attempting to write before end of buffer */

      const remaining = this.len - this.write;

      /* If we are flexible, we'll take any amount of space at buffer end */
      if (flexible && remaining > 0) {
        const size = Math.min(count, remaining);
        return new StreamWriterReservation(this, this.data.subarray(this.write, this.write + size));
      }

      /* Otherwise, if we have at least enough bytes, make a reservation */
      if (remaining >= count) {
        return new StreamWriterReservation(
          this,
          this.data.subarray(this.write, this.write + count),
        );
      } else {
        /* We did not have space at the end of the buffer, so we'll try to wrap around */

        const available = read - 1;

        /* If we are flexible, we'll take any amount of space at buffer begin */
        if (flexible && available > 0) {
          const size = Math.min(count, available);
          return new StreamWriterReservation(this, this.data.subarray(0, size), true);
        }

        /* Otherwise, if there's at least enough bytes at beginning, make a reservation */
        if (available >= count) {
          return new StreamWriterReservation(this, this.data.subarray(0, count), true);
        } else {
          return null;
        }
      }
    } else {
      /* Read strictly follows write */

      const available = read - this.write - 1;

      /* If we are flexible, we'll take any amount of space between write and read */
      if (flexible && available > 0) {
        const size = Math.min(count, available);
        return new StreamWriterReservation(this, this.data.subarray(this.write, this.write + size));
      }

      if (available >= count) {
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
    if (count === 0) return;
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
 * Represents a locking stategy that spin locks can utilize.
 * By default, this lock busy waits. However, subclasses can change this strategy.
 */
export class LockStrategy {
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
   *          0 will busy wait.
   */
  public spin(): number {
    return 0;
  }

  public static get busy() {
    return new LockStrategy();
  }
}

class AsyncLock {
  constructor(protected strategy: LockStrategy) {}

  public reset(): void {
    this.strategy.reset();
  }

  public spin(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.strategy.spin()));
  }
}

class ScratchBuffer {
  private _size = 0;
  private _capacity = 0;

  private _buffer;
  private _data: Uint8Array;
  private _view: DataView;

  public get size() {
    return this._size;
  }

  public get data() {
    return this._data;
  }

  public get view() {
    return this._view;
  }

  constructor() {
    this._buffer = new ArrayBuffer(0);
    this._data = new Uint8Array(this._buffer);
    this._view = new DataView(this._buffer);
  }

  /**
   * Reserves count bytes in the buffer for writing and empties the buffer.
   * @param count Number of bytes to reserve
   */
  reserve(count: number) {
    this._capacity = count;
    this._size = 0;
  }

  /**
   * Pushes data from `bytes` up to the reserved capacity, returning the number of bytes written.
   * @param bytes A byte array to read from.
   */
  push(bytes: Uint8Array): number {
    if (this._buffer.byteLength < this._capacity) {
      this._buffer = new ArrayBuffer(this._capacity);
    }

    if (this._data.byteLength !== this._capacity) {
      this._data = new Uint8Array(this._buffer, 0, this._capacity);
      this._view = new DataView(this._buffer, 0, this._capacity);
    }

    const chunk = bytes.subarray(0, this._capacity - this._size);
    this.data.set(chunk, this._size);
    this._size += chunk.length;
    return chunk.length;
  }
}

/**
 * Represent data in a packed format and provides methods for reading it sequentially.
 */
export class ReadableChunk {
  private offset = 0;
  private view: DataView;
  private static decoder = new TextDecoder();

  /**
   * Creates a new chunk.
   * @param data The data buffer of this chunk
   * @param owned Whether or not this chunk is a view over the raw stream buffer it came from (`false`), or an intermediate buffer (`true`).
   */
  public constructor(
    public readonly data: Uint8Array,
    private readonly owned: boolean,
  ) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  public uint8() {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  public bool() {
    return this.uint8() !== 0;
  }

  public uint16() {
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  public uint32() {
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  public uint64() {
    const value = this.view.getBigUint64(this.offset);
    this.offset += 8;
    return Number(value);
  }

  public int8() {
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  public int16() {
    const value = this.view.getInt16(this.offset);
    this.offset += 2;
    return value;
  }

  public int32() {
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  public int64() {
    const value = this.view.getBigInt64(this.offset);
    this.offset += 8;
    return Number(value);
  }

  public float32() {
    const value = this.view.getFloat32(this.offset);
    this.offset += 4;
    return value;
  }

  public float64() {
    const value = this.view.getFloat64(this.offset);
    this.offset += 8;
    return value;
  }

  public bytes() {
    const length = this.uint32();
    const value = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  public string() {
    let view = this.bytes();

    // We can't deserialize from a SharedArrayBuffer view, so we must make a copy
    if (!this.owned) view = new Uint8Array(view);

    return ReadableChunk.decoder.decode(view);
  }
}

/**
 * Reads chunks from a stream asynchronously.
 */
export class AsyncChunkReader {
  private readonly lock: AsyncLock;
  private readonly stream: StreamReader;
  private readonly scratch = new ScratchBuffer();

  private isAsyncReading = false;

  constructor(private buffer: SharedArrayBuffer, strategy?: LockStrategy) {
    strategy ??= LockStrategy.busy;
    this.lock = new AsyncLock(strategy);
    this.stream = new StreamReader(buffer);
  }

  public async read(): Promise<ReadableChunk> {
    const byteLength = await this.readValue(4, (v) => {
      const ret = new DataView(v.buffer, v.byteOffset, v.byteLength).getUint32(0);
      if (v.buffer === this.buffer) this.stream.consume(4);
      return ret;
    });
    const data = await this.readValue(byteLength, (v) => v);
    return new ReadableChunk(data, data.buffer !== this.buffer);
  }


  public async *readAll(): AsyncIterableIterator<ReadableChunk> {
  }


  private async readValue<T>(byteLength: number, ctor: (data: Uint8Array) => T): Promise<T> {
    if (this.isAsyncReading)
      throw new Error(
        "Attempt to read from the stream before an on-going read has finished. You may have forgotten to `await` one of the DataStreamReader methods.",
      );
    this.isAsyncReading = true;

    this.scratch.reserve(byteLength);

    try {
      while (true) {
        /* Spin until the read buffer has data */
        let view: Uint8Array = this.stream.valid();

        if (byteLength > 0 && view.length === 0) {
          this.lock.reset();
          while (view.length === 0) {
            await this.lock.spin();
            view = this.stream.valid();
          }
        }

        /* Attempt to construct in-place from the stream */
        if (this.scratch.size === 0 && view.length >= byteLength) {
          return ctor(
            new Uint8Array(view.buffer, view.byteOffset, Math.min(byteLength, view.length)),
          );
        }

        /* Otherwise, we must accumulate into the scratch buffer */
        this.stream.consume(this.scratch.push(view));
        if (this.scratch.size === byteLength) return ctor(this.scratch.data);
      }
    } finally {
      this.isAsyncReading = false;
    }
  }
}
