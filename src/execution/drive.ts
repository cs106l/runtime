import { DriveResult, FileDescriptor, WASIDrive, WASIFS } from "@cs106l/wasi";
import { WASISnapshotPreview1 } from "@cs106l/wasi";
import { InternalCanvasEventHandler, InternalCanvasEventSchema, nonVoidActions } from "./canvas";
import { JSONParser } from "@streamparser/json";

export class CanvasAwareDrive extends WASIDrive {
  /**
   * Reads **incoming data** from the WASM binary whenever it issues a WRITE system call
   */
  private reader = new ObjectStreamReader();

  /**
   * Writes **outgoing data** to the WASM binary whenever it issues a READ system call
   */
  private writer = new ObjectStreamWriter();

  constructor(private handler: InternalCanvasEventHandler, fs?: WASIFS) {
    super(fs ?? {});
    this.reader.onMessage = (raw: unknown) => {
      const result = InternalCanvasEventSchema.safeParse(raw);

      if (result.error) {
        console.warn(
          `Internal: Ignoring bad request for canvas action received from WASM binary: ${result.error.message}`,
        );
        return;
      }

      const event = result.data;
      const response = this.handler.onEvent(event);
      if (nonVoidActions.has(event.action)) this.writer.set(response);
    };
  }

  override write(fd: FileDescriptor, data: Uint8Array): WASISnapshotPreview1.Result {
    if (this.isCanvasFd(fd)) {
      this.reader.onIncomingBytes(data);
      return WASISnapshotPreview1.Result.SUCCESS;
    }

    return super.write(fd, data);
  }

  override read(fd: FileDescriptor, size: number): DriveResult<Uint8Array> {
    if (this.isCanvasFd(fd)) {
      return [WASISnapshotPreview1.Result.SUCCESS, this.writer.onOutgoingBytes(size)];
    }

    return super.read(fd, size);
  }

  private isCanvasFd(fd: FileDescriptor): boolean {
    const file = this.openMap.get(fd);
    if (!file) return false;
    const path = file.stat().path;
    return path === "/.canvas";
  }
}

class ObjectStreamReader {
  private parser: JSONParser;

  public onMessage?: (message: unknown) => void;

  constructor() {
    this.parser = new JSONParser();
    this.parser.onValue = (value) => {
      this.onMessage?.(value);
    };
  }

  public onIncomingBytes(bytes: Uint8Array) {
    this.parser.write(bytes);
  }
}

class ObjectStreamWriter {
  private stream = new Stream();
  private encoder = new TextEncoder();

  public onOutgoingBytes(size: number): Uint8Array {
    return this.stream.popMax(size);
  }

  public set(result: unknown) {
    const json = JSON.stringify(result);
    const payload = this.encoder.encode(json);
    this.stream.clear();
    this.stream.push(payload);
  }
}

/**
 * An efficient, bring-your-own-buffer queue
 */
class Stream {
  private static zero = new Uint8Array(0);

  private chunks: Uint8Array[] = [];
  private totalBytes = 0;

  private scratch = new Uint8Array(4);
  private scratchView = new DataView(this.scratch.buffer);

  /** Pushes bytes to the queue */
  push(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    this.chunks.push(bytes);
    this.totalBytes += bytes.length;
  }

  /** Pops numBytes from the queue. Returns null if there's not enough bytes. */
  pop(numBytes: number): Uint8Array | null {
    if (this.totalBytes < numBytes) return null;
    return this.popExact(numBytes);
  }

  /** Clears the queue */
  clear(): void {
    this.chunks.length = 0;
    this.totalBytes = 0;
  }

  /** Pops at most maxBytes from the queue. */
  popMax(maxBytes: number): Uint8Array {
    const n = Math.min(this.totalBytes, maxBytes);
    return this.popExact(n);
  }

  /** Pushes a big-endian, unsigned 32-bit integer */
  pushU32(value: number): void {
    this.scratchView.setUint32(0, value);
    this.push(this.scratch);
  }

  /** Pops a big-endian, unsigned 32-bit integer */
  popU32(): number | null {
    const bytes = this.pop(4);
    if (!bytes) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(0);
  }

  private popExact(numBytes: number): Uint8Array {
    if (numBytes > this.totalBytes) throw new Error("Not enough bytes");

    let out: Uint8Array | null = null;
    let offset = 0;

    while (numBytes > 0) {
      const head = this.chunks[0];

      if (out === null && numBytes <= head.length) {
        /* Optimization: Just return segment of head if requested allocation fits inside it */
        out = head.subarray(0, numBytes);
        this.chunks[0] = head.subarray(numBytes);
        this.totalBytes -= numBytes;
        if (this.chunks[0].length === 0) this.chunks.shift();
        return out;
      }

      if (out === null) out = new Uint8Array(numBytes);

      const chunk = head.subarray(0, numBytes);
      out.set(chunk, offset);
      offset += chunk.length;
      numBytes -= chunk.length;

      const remaining = head.subarray(chunk.length);
      if (remaining.length === 0) this.chunks.shift();
      else this.chunks[0] = remaining;
    }

    if (!out) return Stream.zero;
    this.totalBytes -= out.length;
    return out;
  }
}
