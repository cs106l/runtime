import { DriveResult, FileDescriptor, WASIDrive, WASIFS } from "@cs106l/wasi";
import { WASISnapshotPreview1 } from "@cs106l/wasi";
import { z } from "zod";

export type CanvasID = string;

export type CanvasDriveOptions = {
  /**
   * A callback that dispatches canvas updates to the main thread and synchronously gets their result.
   * @param event The action that the WASM binary requested.
   * @returns The result of calling the relevant method, whatever its format might be.
   */
  dispatcher(event: BaseCanvasEvent): CanvasEventResult<typeof event.action>;
};

export class CanvasDrive extends WASIDrive {
  private readers = new Map<CanvasAction, ByteReader>();
  private writers = new Map<CanvasAction, ByteWriter>();

  constructor(private config: CanvasDriveOptions, fs?: WASIFS) {
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
    const result = this.config.dispatcher(message);
    writer.set(result);
  }

  private getAction(fd: FileDescriptor): CanvasAction | undefined {
    const file = this.openMap.get(fd);
    if (!file) return;
    const path = file.stat().path;

    const match = path.match(/^\/\.canvas\/([^\/]+)/);
    if (!match) return;
    const action = match[1] as CanvasAction;
    if (!allowedActions.includes(action)) return undefined;
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

/**
 * The raw mesage payload that gets sent over the wire to trigger
 * a canvas action must follow a specific binary format.
 *
 * Data is written to `.canvas/<action>` as UTF8 encoded JSON encoded like so:
 *
 * ```
 * [length: 4 bytes] [payload: length bytes]
 * ```
 *
 * The header length should be an unsigned, 32-bit integer written in big-endian format.
 * The payload should be the JSON encoded arguments array for the requested action.
 *
 * If the action is a method that returns a value (and that value can be serialized
 * in a meaningful way), then the next read from `.canvas/<action>` will yield UTF8
 * encoded JSON with the result in the same format.
 */

// Create canvas:   write   .canvas/new
// Fill rect:       write   .canvas/rect
// Get font:        read    .canvas/font
// Sleep:           write   .canvas/sleep

const unsigned = z.number().nonnegative();

function CanvasAction<Action extends z.Primitive>(action: Action) {
  return z.object({
    action: z.literal(action),
    id: z.string(),
  });
}

function CanvasActionArgs<
  Action extends z.Primitive,
  Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]],
>(action: Action, ...args: Args) {
  return z.object({
    action: z.literal(action),
    id: z.string(),
    args: z.tuple(args),
  });
}

const CanvasEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sleep"),
    args: z.tuple([unsigned]),
  }),
  z.object({
    action: z.literal("new"),
  }),
  CanvasAction("width"),
  CanvasActionArgs("setWidth", unsigned),
  CanvasAction("height"),
  CanvasActionArgs("setHeight", unsigned),
  CanvasActionArgs("fillRect", z.number(), z.number(), z.number(), z.number()),
]);

const allowedActions = CanvasEventSchema.options.map((o) => o.shape.action.value);

export type BaseCanvasEvent = z.infer<typeof CanvasEventSchema>;
export type CanvasEvent<Action extends CanvasAction> = BaseCanvasEvent & { action: Action };
export type CanvasAction = BaseCanvasEvent["action"];
export type CanvasEventResult<Action extends CanvasAction> = CanvasEventResultMap[Action];

type CanvasEventResultMap = {
  sleep: void;
  new: CanvasID;
  width: number;
  setWidth: void;
  height: number;
  setHeight: void;
  fillRect: void;
};

class ByteReader {
  public onMessage?: (message: unknown) => void;

  private buffer = new Uint8Array(0);
  private decoder = new TextDecoder();

  constructor() {}

  public onIncomingBytes(bytes: Uint8Array) {
    this.buffer = ByteReader.concat(this.buffer, bytes);
    console.log(
      `ByteReader: Receiving ${bytes.length} bytes. Buffer at ${this.buffer.length} bytes`,
    );
    while (true) {
      const length = this.readLength();
      if (!length) {
        console.log(`ByteReader: Not enough bytes for header, skipping...`);
        break;
      }

      console.log(`ByteReader: Attempting to read message of size ${length}...`);
      const payload = this.buffer.subarray(4, 4 + length);
      if (payload.length < length) {
        console.log(`ByteReader: Not enough bytes for message, skipping...`);
        break;
      }

      try {
        const json = this.decoder.decode(payload);
        console.log(`ByteReader: Got raw JSON ${json}`);
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
    console.log(`ByteWriter: ${size} bytes requested. Buffer at ${this.buffer.length} bytes`);
    // Drain up to size bytes from buffer
    const chunk = this.buffer.subarray(0, size);
    this.buffer = this.buffer.subarray(size);
    console.log(`ByteWriter: Sent ${chunk.length} bytes.`);
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
