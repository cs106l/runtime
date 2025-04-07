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
  ComplexArgs(
    "fillText",
    z.union([
      z.tuple([z.string(), z.number(), z.number()]),
      z.tuple([z.string(), z.number(), z.number(), z.number()]),
    ]),
  ),

  Nullary("reset"),

  ComplexArgs("fill", z.tuple([z.enum(["nonzero", "evenodd"])]).optional()),
  Args("fillRect", z.number(), z.number(), z.number(), z.number()),
  Args("rect", z.number(), z.number(), z.number(), z.number()),

  Nullary("beginPath"),
  Args("moveTo", z.number(), z.number()),
  Args("lineTo", z.number(), z.number()),
  Nullary("stroke"),
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
  "fillText",
  "reset",
  "fill",
  "fillRect",
  "rect",
  "beginPath",
  "moveTo",
  "lineTo",
  "stroke",
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
    protected manager: CanvasManager,
    public readonly id: CanvasID,
    public canvas: HTMLCanvasElement,
  ) {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error(`Unable to get rendering context for created canvas`);
    this.context = context;
  }

  onEvent(event: BaseCanvasEvent): unknown {
    this.log.push(event);
    switch (event.action) {
      case "sleep":
      case "new":
        return;
      case "delete":
        this.canvas.remove();
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
        return this.context.fill(...args);
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
      case "beginPath":
        return this.context.beginPath();
      case "lineTo":
        return this.context.lineTo(...event.args);
      case "moveTo":
        return this.context.moveTo(...event.args);
      case "stroke":
        return this.context.stroke();
    }
  }

  public refresh() {
    this.context.reset();
    this.log.forEach(this.onEvent.bind(this));
  }

  private color(color: string) {
    const theme = this.manager.options.theme;
    if (color in theme) return theme[color];
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
  public options: CanvasManagerOptions;
  protected canvasMap = new Map<CanvasID, CanvasContainer>();

  constructor(protected readonly source: Node, options?: PartialDeep<CanvasManagerOptions>) {
    this.options = {
      onEvent: options?.onEvent,
      theme: {
        foreground: options?.theme?.foreground ?? "#000",
        background: options?.theme?.background ?? "#fff",
        ...options?.theme,
      },
    };
  }

  onEvent(event: BaseCanvasEvent) {
    this.options.onEvent?.(event);

    if (event.action === "sleep") return;

    if (event.action === "new") {
      const id = crypto.randomUUID();
      this.getContainer(id);
      return id;
    }

    const container = this.getContainer(event.id);
    if (event.action === "delete") this.canvasMap.delete(event.id);
    return container.onEvent(event);
  }

  public refresh() {
    this.canvasMap.forEach((container) => container.refresh());
  }

  protected getCanvas() {
    const canvas = document.createElement("canvas");
    this.source.appendChild(canvas);
    return canvas;
  }

  protected getContainer(id: CanvasID) {
    let container = this.canvasMap.get(id);
    if (!container) {
      const canvas = this.getCanvas();
      container = new CanvasContainer(this, id, canvas);
      this.canvasMap.set(id, container);
    }
    return container;
  }
}
