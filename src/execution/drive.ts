import { DriveResult, FileDescriptor, WASIDrive, WASIFS } from "@cs106l/wasi";
import { WASISnapshotPreview1 } from "@cs106l/wasi";
import {
  allowedCanvasActions,
  BaseCanvasEvent,
  CanvasAction,
  CanvasEventHandler,
  CanvasEventSchema,
} from "./canvas";

export class CanvasDrive extends WASIDrive {
  private readers = new Map<CanvasAction, ByteReader>();
  private writers = new Map<CanvasAction, ByteWriter>();

  constructor(private handler: CanvasEventHandler, fs?: WASIFS) {
    super(fs ?? {});
  }

  override write(fd: FileDescriptor, data: Uint8Array): WASISnapshotPreview1.Result {
    const action = this.getAction(fd);
    if (action) {
      const reader = this.getReader(action);
      reader.onIncomingBytes(data);
      return WASISnapshotPreview1.Result.SUCCESS;
    }

    return super.write(fd, data);
  }

  override read(fd: FileDescriptor, size: number): DriveResult<Uint8Array> {
    const action = this.getAction(fd);
    if (action) {
      const writer = this.getWriter(action);
      const bytes = writer.onOutgoingBytes(size);
      return [WASISnapshotPreview1.Result.SUCCESS, bytes];
    }

    return super.read(fd, size);
  }

  private onCanvasMessage(message: BaseCanvasEvent) {
    const writer = this.getWriter(message.action);
    const result = this.handler.onEvent(message);
    writer.set(result);
  }

  private getAction(fd: FileDescriptor): CanvasAction | undefined {
    const file = this.openMap.get(fd);
    if (!file) return;
    const path = file.stat().path;

    const match = path.match(/^\/\.canvas\/([^\/]+)/);
    if (!match) return;
    const action = match[1] as CanvasAction;
    if (!allowedCanvasActions.includes(action)) return undefined;
    return action;
  }

  private getReader(action: CanvasAction) {
    let reader = this.readers.get(action);
    if (!reader) {
      reader = new ByteReader();
      reader.onMessage = (payload) => {
        // The payload will contain everything except the action name
        const raw = Object.assign({ action }, payload);
        const result = CanvasEventSchema.safeParse(raw);

        if (result.error) {
          console.warn(
            `Internal: Ignoring bad request for canvas action received from WASM binary: ${result.error.message}`,
          );
          return;
        }

        this.onCanvasMessage(result.data);
      };
      this.readers.set(action, reader);
    }
    return reader;
  }

  private getWriter(action: CanvasAction) {
    let writer = this.writers.get(action);
    if (!writer) {
      writer = new ByteWriter();
      this.writers.set(action, writer);
    }
    return writer;
  }
}

class ByteReader {
  public onMessage?: (message: unknown) => void;

  private buffer = new Uint8Array(0);
  private decoder = new TextDecoder();

  constructor() {}

  public onIncomingBytes(bytes: Uint8Array) {
    this.buffer = ByteReader.concat(this.buffer, bytes);
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

class ByteWriter {
  private result?: unknown;

  private buffer = new Uint8Array(0);
  private encoder = new TextEncoder();

  public onOutgoingBytes(size: number): Uint8Array {
    // Drain up to size bytes from buffer
    const chunk = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    return chunk;
  }

  public set(result: ByteWriter["result"]) {
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
