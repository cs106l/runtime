import { DriveResult, FileDescriptor, WASIDrive, WASIFS } from "@cs106l/wasi";
import { WASISnapshotPreview1 } from "@cs106l/wasi";
import { InternalCanvasEventHandler, InternalCanvasEventSchema, nonVoidActions } from "./canvas";

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
  public onMessage?: (message: unknown) => void;

  private buffer = new Uint8Array(0);
  private decoder = new TextDecoder();

  constructor() {}

  public onIncomingBytes(bytes: Uint8Array) {
    this.buffer = ObjectStreamReader.concat(this.buffer, bytes);
    while (true) {
      const length = this.readLength();
      if (!length) {
        break;
      }

      const payload = this.buffer.subarray(4, 4 + length);
      if (payload.length < length) {
        break;
      }

      try {
        const json = this.decoder.decode(payload);
        const result = json ? JSON.parse(json) : undefined;
        this.onMessage?.(result);
      } catch (err) {
        console.warn("Internal: couldn't read canvas message", err);
      } finally {
        // Skip this message no matter what
        this.buffer = this.buffer.subarray(4 + length);
      }
    }
  }

  /* Reads a 32-bit length off the top of the buffer. Does not modify the buffer */
  private readLength(): number | null {
    if (this.buffer.length < 4) return null;
    const view = new DataView(this.buffer.buffer);
    const length = view.getUint32(this.buffer.byteOffset);
    return length;
  }

  private static concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
  }
}

class ObjectStreamWriter {
  private result?: unknown;

  private buffer = new Uint8Array(0);
  private encoder = new TextEncoder();

  public onOutgoingBytes(size: number): Uint8Array {
    // Drain up to size bytes from buffer
    const chunk = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return chunk;
  }

  public set(result: ObjectStreamWriter["result"]) {
    this.result = result;

    // Set buffer contents
    const json = result === undefined ? "" : JSON.stringify(this.result);
    const payload = this.encoder.encode(json);

    const full = new Uint8Array(4 + payload.length);
    const view = new DataView(full.buffer, full.byteOffset);
    view.setUint32(0, payload.length);
    full.set(payload, 4);

    this.buffer = full;
  }
}
