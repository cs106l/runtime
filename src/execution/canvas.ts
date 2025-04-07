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

function Property<Action extends string, Value extends z.ZodTypeAny>(action: Action, value: Value) {
  return [Nullary(`get_${action}`), Args(`set_${action}`, value)] as const;
}

export const CanvasEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sleep"),
    args: z.tuple([z.number()]),
  }),
  z.object({ action: z.literal("new") }),
  Nullary("delete"),

  ...Property("width", z.number()),
  ...Property("height", z.number()),
  ...Property("lineWidth", z.number()),
  ...Property("fillStyle", z.string()),
  ...Property("strokeStyle", z.string()),
  ...Property("font", z.string()),
  ...Property("textAlign", z.string()),
  ...Property("textBaseline", z.string()),

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
 * This is an optimization--since these actions return void, we don't need to wait for data
 * to be communicated back, saving on serialization overhead.
 */
export const voidActions: CanvasAction[] = [
  "sleep",
  "delete",
  "set_width",
  "set_height",
  "set_lineWidth",
  "set_fillStyle",
  "set_strokeStyle",
  "set_font",
  "set_textAlign",
  "set_textBaseline",
  "fillText",
  "reset",
  "fill",
  "fillRect",
  "rect",
  "beginPath",
  "moveTo",
  "lineTo",
  "stroke",
  "closePath",
  "save",
  "restore",
  "commit",
];

export const allowedCanvasActions = CanvasEventSchema.options.map((o) => o.shape.action.value);
export type BaseCanvasEvent = z.infer<typeof CanvasEventSchema>;
export type CanvasEvent<Action extends CanvasAction> = BaseCanvasEvent & { action: Action };
export type CanvasAction = BaseCanvasEvent["action"];

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
      case "sleep":
      case "new":
        return;
      case "get_width":
        return this.canvas.width;
      case "set_width":
        this.canvas.style.width = `${event.args[0]}px`;
        return void (this.canvas.width = event.args[0]);
      case "get_height":
        return this.canvas.height;
      case "set_height":
        this.canvas.style.height = `${event.args[0]}px`;
        return void (this.canvas.height = event.args[0]);
      case "get_lineWidth":
        return this.context.lineWidth;
      case "set_lineWidth":
        return void (this.context.lineWidth = event.args[0]);
      case "get_fillStyle":
        return this.context.fillStyle;
      case "set_fillStyle":
        return void (this.context.fillStyle = this.color(event.args[0]));
      case "get_strokeStyle":
        return this.context.strokeStyle;
      case "set_strokeStyle":
        return void (this.context.strokeStyle = this.color(event.args[0]));
      case "reset":
        this.context.reset();
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
      case "get_font":
        return this.context.font;
      case "set_font":
        return void (this.context.font = event.args[0]);
      case "set_textAlign":
        return void (this.context.textAlign = event.args[0] as any);
      case "get_textAlign":
        return this.context.textAlign;
      case "set_textBaseline":
        return void (this.context.textBaseline = event.args[0] as any);
      case "get_textBaseline":
        return this.context.textBaseline;
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

    if (event.action === "sleep") return;

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
