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

import { z } from "zod";
import type { PartialDeep } from "type-fest";

export type CanvasID = string;

function Nullary<Action extends z.Primitive>(action: Action) {
  return z.object({
    action: z.literal(action),
    id: z.string(),
  });
}

function Args<Action extends z.Primitive, Args extends [z.ZodTypeAny, ...z.ZodTypeAny[]]>(
  action: Action,
  ...args: Args
) {
  return z.object({
    action: z.literal(action),
    id: z.string(),
    args: z.tuple(args),
  });
}

function ComplexArgs<Action extends z.Primitive, Args extends z.ZodTypeAny>(
  action: Action,
  args: Args,
) {
  return z.object({
    action: z.literal(action),
    id: z.string(),
    args,
  });
}

function Setter<Action extends string, Value extends z.ZodTypeAny>(action: Action, value: Value) {
  return Args(`set_${action}`, value);
}

export const InternalCanvasEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sleep"),
    args: z.tuple([z.number()]),
  }),
  /**
   * Requests to create a new canvas.
   * Handlers for this event should return the `CanvasID` of the new canvas.
   */
  z.object({ action: z.literal("new") }),
  Nullary("delete"),

  Setter("width", z.number()),
  Setter("height", z.number()),
  Setter("lineWidth", z.number()),
  Setter("fillStyle", z.string()),
  Setter("strokeStyle", z.string()),
  Setter("font", z.string()),
  Setter("textAlign", z.string()),
  Setter("textBaseline", z.string()),

  ComplexArgs(
    "fillText",
    z.union([
      z.tuple([z.string(), z.number(), z.number()]),
      z.tuple([z.string(), z.number(), z.number(), z.number()]),
    ]),
  ),

  Nullary("reset"),

  ComplexArgs("fill", z.tuple([z.string()]).optional()),
  Args("fillRect", z.number(), z.number(), z.number(), z.number()),
  Args("rect", z.number(), z.number(), z.number(), z.number()),

  Nullary("beginPath"),
  Args("moveTo", z.number(), z.number()),
  Args("lineTo", z.number(), z.number()),
  Nullary("stroke"),
  Nullary("closePath"),

  Nullary("save"),
  Nullary("restore"),

  Nullary("commit"),
]);

/**
 * This is the set of `CanvasAction` for which the browser main thread will send back
 * a return value to the web worker thread, which will synchronously consume it.
 *
 * Actions should rarely be listed here, as communicating data from the main thread back to
 * the web worker can incur a significant loss of throughput.
 *
 * Instead, think of the runtime canvas (running within the WASM binary on the web worker)
 * as keeping its own internal copy of the canvas state. When that copy changes, it tells
 * the browser canvas to update by dispatching an action to the filesystem.
 */
export const nonVoidActions = new Set<InternalCanvasAction>(["new"]);

/**
 * An internal canvas event sent from the WASM binary to the canvas-aware filesystem.
 * This is a strictly larger set than what gets sent to the client of the application (BaseCanvasEvent)
 * since there are some actions that are handled only internally (e.g. commit).
 */
type InternalBaseCanvasEvent = z.infer<typeof InternalCanvasEventSchema>;

type InternalCanvasAction = InternalBaseCanvasEvent["action"];
type InternalCanvasEvent<Action extends InternalCanvasAction> = InternalBaseCanvasEvent & {
  action: Action;
};

export interface InternalCanvasEventHandler {
  onEvent(event: InternalBaseCanvasEvent): unknown;
}

type ExcludeUnion<
  Union,
  Discriminator extends keyof Union,
  Keys extends Union[Discriminator],
> = Union extends { [K in Discriminator]: Keys } ? never : Union;

export type BaseCanvasEvent = ExcludeUnion<InternalBaseCanvasEvent, "action", "sleep" | "commit">;
export type CanvasAction = BaseCanvasEvent["action"];
export type CanvasEvent<Action extends CanvasAction> = InternalCanvasEvent<Action>;

export interface CanvasEventHandler {
  onEvent(event: BaseCanvasEvent): unknown;
}

export class CanvasContainer implements CanvasEventHandler {
  public context: CanvasRenderingContext2D;
  protected log: BaseCanvasEvent[] = [];

  constructor(
    public readonly id: CanvasID,
    public canvas: HTMLCanvasElement,
    public theme: CanvasTheme,
  ) {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error(`Unable to get rendering context for created canvas`);
    this.context = context;
  }

  onEvent(event: BaseCanvasEvent, replay?: boolean): unknown {
    if (!replay) this.log.push(event);
    switch (event.action) {
      case "new":
      case "delete":
        return;
      case "set_width":
        this.canvas.style.width = `${event.args[0]}px`;
        return void (this.canvas.width = event.args[0]);
      case "set_height":
        this.canvas.style.height = `${event.args[0]}px`;
        return void (this.canvas.height = event.args[0]);
      case "set_lineWidth":
        return void (this.context.lineWidth = event.args[0]);
      case "set_fillStyle":
        return void (this.context.fillStyle = this.color(event.args[0]));
      case "set_strokeStyle":
        return void (this.context.strokeStyle = this.color(event.args[0]));
      case "reset":
        if (typeof this.context.reset === "undefined") {
          /* Unfortunately some older and esp. mobile browsers don't have access to this function,
           * so we apply a bandaid here */
          this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
          this.context.reset();
        }

        this.log = [];
        return;
      case "fill":
        const args = event.args ?? [];
        return this.context.fill(...(args as any[]));
      case "fillRect":
        return this.context.fillRect(...event.args);
      case "rect":
        return this.context.rect(...event.args);
      case "fillText":
        if (event.args.length === 3) return this.context.fillText(...event.args);
        return this.context.fillText(...event.args);
      case "set_font":
        return void (this.context.font = event.args[0]);
      case "set_textAlign":
        return void (this.context.textAlign = event.args[0] as any);
      case "set_textBaseline":
        return void (this.context.textBaseline = event.args[0] as any);
      case "beginPath":
        return this.context.beginPath();
      case "lineTo":
        return this.context.lineTo(...event.args);
      case "moveTo":
        return this.context.moveTo(...event.args);
      case "stroke":
        return this.context.stroke();
      case "closePath":
        return this.context.closePath();
      case "save":
        return this.context.save();
      case "restore":
        return this.context.restore();
    }
  }

  public refresh() {
    this.context.reset();
    this.log.forEach((event) => this.onEvent(event, true));
  }

  public reset() {
    this.log.length = 0;
    this.context.reset();
  }

  protected color(color: string) {
    if (color in this.theme) return this.theme[color];
    return color;
  }
}

export type CanvasTheme = {
  foreground: string;
  background: string;
} & Record<string, string>;

export type CanvasManagerOptions = {
  onEvent?: (event: BaseCanvasEvent) => void;
  theme: CanvasTheme;
};

export class CanvasManager implements CanvasEventHandler {
  private _options: CanvasManagerOptions;
  protected canvasMap = new Map<CanvasID, CanvasContainer>();

  protected readonly stale: CanvasContainer[] = [];
  protected resetTimeout?: ReturnType<typeof setTimeout>;

  constructor(protected readonly source: Node, options?: PartialDeep<CanvasManagerOptions>) {
    this._options = {
      onEvent: options?.onEvent,
      theme: {
        foreground: options?.theme?.foreground ?? "#000",
        background: options?.theme?.background ?? "#fff",
        ...options?.theme,
      },
    };
  }

  get options() {
    return this._options;
  }

  set options(value: CanvasManagerOptions) {
    this._options = value;
    this.canvasMap.forEach((container) => (container.theme = value.theme));
    this.stale.forEach((container) => (container.theme = value.theme));
  }

  onEvent(event: BaseCanvasEvent) {
    this._options.onEvent?.(event);

    if (event.action === "new") {
      // Use stale canvases first
      if (this.stale.length > 0) {
        const stale = this.stale.pop()!;
        this.canvasMap.set(stale.id, stale);
        stale.reset();
        return stale.id;
      }

      const id = crypto.randomUUID();
      const canvas = this.getCanvas();
      const container = new CanvasContainer(id, canvas, this._options.theme);
      this.canvasMap.set(id, container);
      return id;
    }

    if (event.action === "delete") return this.remove(event.id);

    const container = this.canvasMap.get(event.id);
    if (!container) return null;
    return container.onEvent(event);
  }

  public refresh() {
    this.canvasMap.forEach((container) => container.refresh());
  }

  public remove(id: CanvasID) {
    let container: CanvasContainer;
    if (this.canvasMap.has(id)) {
      container = this.canvasMap.get(id)!;
      this.canvasMap.delete(id);
    } else {
      const idx = this.stale.findIndex((c) => c.id === id);
      if (idx === -1) return;
      container = this.stale[idx];
      this.stale.splice(idx, 1);
    }

    container.canvas.remove();
    this.onEvent?.({ action: "delete", id });
  }

  public reset(timeoutMs?: number) {
    clearTimeout(this.resetTimeout);
    if (timeoutMs === undefined || timeoutMs <= 0) {
      const ids = [...this.canvasMap.keys()];
      ids.forEach(this.remove.bind(this));
      this.stale.length = 0;
    } else {
      this.stale.push(...this.canvasMap.values());
      this.canvasMap.clear();
      this.resetTimeout = setTimeout(() => {
        // Remove all stale canvases after timeout
        const ids = this.stale.map((c) => c.id);
        ids.forEach(this.remove.bind(this));
      }, timeoutMs);
    }
  }

  protected getCanvas() {
    const canvas = document.createElement("canvas");
    this.source.appendChild(canvas);
    return canvas;
  }
}
