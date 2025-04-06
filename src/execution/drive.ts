import { DriveResult, FileDescriptor, WASIDrive, WASIFS } from "@cs106l/wasi";
import { CanvasOutput } from ".";
import { WASISnapshotPreview1 } from "@cs106l/wasi";
import { z } from "zod";

export type CanvasID = string;

export type CanvasDriveOptions = Omit<CanvasOutput, "create"> & {
  requestCanvas: (id: CanvasID, width: number, height: number) => void;
};

export class CanvasDrive extends WASIDrive {
  private contexts: Map<CanvasID, OffscreenCanvasRenderingContext2D> = new Map();
  private readers = new Map<CanvasDriveAction, ByteReader<CanvasDriveMessagePayload>>();
  private writers = new Map<CanvasDriveAction, ByteWriter>();

  private sleep = new Int32Array(new SharedArrayBuffer(4));

  constructor(private config: CanvasDriveOptions, fs?: WASIFS) {
    super(fs ?? {});
  }

  public receiveCanvas(id: CanvasID, canvas: OffscreenCanvas) {
    const context = canvas.getContext("2d");
    if (context === null)
      console.warn(`Couldn't initialize canvas '${id}' rendering context: already initialized`);
    else this.contexts.set(id, context);
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

  private onCanvasMessage(message: CanvasDriveMessage) {
    const writer = this.getWriter(message.action);
    const action = message.action;
    const args = message.args;

    switch (action) {
      case "new":
        const id = crypto.randomUUID();
        this.config.requestCanvas(id, args[0] as number, args[1] as number);
        writer.set(id);
        return;

      case "sleep":
        Atomics.wait(this.sleep, 0, 0, message.args[0] as number);
        return;
    }

    /* Canvas specific operations */
    const context = this.contexts.get(message.id);
    if (!context) {
      console.warn(
        `Internal: attempt to manipulate canvas without a valid context: id ${message.id}`,
      );
      return;
    }

    switch (action) {
      case "height":
        if (args.length === 0) writer.set(context.canvas.height);
        else context.canvas.height = args[0] as number;
        break;

      case "width":
        if (args.length === 0) writer.set(context.canvas.width);
        else context.canvas.width = args[0] as number;
        break;
    }
  }

  private defaultWriter(action: CanvasDriveAction): ByteWriter {
    const writer = new ByteWriter();
    return writer;
  }

  private getAction(fd: FileDescriptor): CanvasDriveAction | undefined {
    const file = this.openMap.get(fd);
    if (!file) return;
    const path = file.stat().path;

    const match = path.match(/^\/\.canvas\/([^\/]+)/);
    if (!match) return;
    const action = match[1] as CanvasDriveAction;
    if (!CanvasActions.includes(action)) return undefined;
    return action;
  }

  private getReader(action: CanvasDriveAction) {
    let reader = this.readers.get(action);
    if (!reader) {
      reader = new ByteReader(MessagePayloadSchema);
      reader.onMessage = (payload) => this.onCanvasMessage({ ...payload, action });
      this.readers.set(action, reader);
    }
    return reader;
  }

  private getWriter(action: CanvasDriveAction) {
    let writer = this.writers.get(action);
    if (!writer) {
      writer = this.defaultWriter(action);
      this.writers.set(action, writer);
    }
    return writer;
  }
}

// Create canvas:   write   .canvas/new
// Fill rect:       write   .canvas/rect
// Get font:        read    .canvas/font
// Sleep:           write   .canvas/sleep

const MessagePayloadSchema = z.object({
  /**
   * Which canvas are we writing to/reading from?
   * This is defaulted since some methods don't use this (e.g. new, sleep)
   */
  id: z.string().default(""),
  /**
   * Arguments to the corresponding canvas method for this action.
   * If the action takes no arguments, this can be undefined (the same as empty).
   */
  args: z.unknown().array().optional().default([]),
});

/**
 * This is the raw mesage payload that gets sent over the wire to trigger
 * a canvas action. This data is written to `.canvas/<action>` as UTF8 encoded JSON,
 * encoded like so:
 *
 * ```
 * [length: 4 bytes] [payload: length bytes]
 * ```
 *
 * The header length should be an unsigned, 32-bit integer written in big-endian format.
 *
 * If the action is a method that returns a value (and that value can be serialized
 * in a meaningful way), then the next read from `.canvas/<action>` will yield UTF8
 * encoded JSON with the result in the same format.
 */
type CanvasDriveMessagePayload = z.infer<typeof MessagePayloadSchema>;

const CanvasProperties = ["width", "height"] as const;
const CanvasMethods = ["new", "sleep"] as const;
const CanvasActions = [...CanvasProperties, ...CanvasMethods];

export type CanvasDriveAction = (typeof CanvasProperties)[number] | (typeof CanvasMethods)[number];

export type CanvasDriveMessage = CanvasDriveMessagePayload & {
  action: CanvasDriveAction;
};

class ByteReader<T> {
  public onMessage?: (message: T) => void;

  private buffer = new Uint8Array(0);
  private decoder = new TextDecoder();

  constructor(private schema: z.ZodTypeAny) {}

  public onIncomingBytes(bytes: Uint8Array) {
    this.buffer = ByteReader.concat(this.buffer, bytes);
    while (true) {
      const length = this.readLength();
      if (!length) break;
      const payload = this.buffer.subarray(4, 4 + length);
      if (payload.length < length) break;

      try {
        const json = this.decoder.decode(payload);
        const raw = JSON.parse(json);
        this.onMessage?.(this.schema.parse(raw));
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
    const json = this.result !== undefined ? JSON.stringify(this.result) : "";
    const payload = this.encoder.encode(json);

    const full = new Uint8Array(4 + payload.length);
    const view = new DataView(full.buffer, full.byteOffset);
    view.setUint32(0, payload.length);
    full.set(payload, 4);

    this.buffer = full;
  }
}
