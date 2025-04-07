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

export type CanvasID = string;

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

export const CanvasEventSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sleep"),
    args: z.tuple([unsigned]),
  }),
  z.object({ action: z.literal("new") }),
  CanvasAction("delete"),
  CanvasAction("width"),
  CanvasActionArgs("setWidth", unsigned),
  CanvasAction("height"),
  CanvasActionArgs("setHeight", unsigned),
  CanvasAction("reset"),
  CanvasActionArgs("fillRect", z.number(), z.number(), z.number(), z.number()),
]);

export const allowedCanvasActions = CanvasEventSchema.options.map((o) => o.shape.action.value);
export type BaseCanvasEvent = z.infer<typeof CanvasEventSchema>;
export type CanvasEvent<Action extends CanvasAction> = BaseCanvasEvent & { action: Action };
export type CanvasAction = BaseCanvasEvent["action"];
export type CanvasEventResult<Action extends CanvasAction> = CanvasEventResultMap[Action];

type CanvasEventResultMap = {
  sleep: void;
  new: CanvasID;
  delete: void;
  width: number;
  setWidth: void;
  height: number;
  setHeight: void;
  reset: void;
  fillRect: void;
};

export interface CanvasEventHandler {
  onEvent(event: BaseCanvasEvent): unknown;
}

export class CanvasContainer implements CanvasEventHandler {
  public context: CanvasRenderingContext2D;
  protected log: BaseCanvasEvent[] = [];

  constructor(public readonly id: CanvasID, public canvas: HTMLCanvasElement) {
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
      case "width":
        return this.canvas.width;
      case "setWidth":
        this.canvas.style.width = `${event.args[0]}px`;
        return (this.canvas.width = event.args[0]);
      case "height":
        return this.canvas.height;
      case "setHeight":
        this.canvas.style.height = `${event.args[0]}px`;
        return (this.canvas.height = event.args[0]);
      case "reset":
        this.context.reset();
        this.log = [];
        return;
      case "fillRect":
        return this.context.fillRect(...event.args);
    }
  }

  public refresh() {
    this.context.reset();
    this.log.forEach(this.onEvent.bind(this));
  }
}

export type CanvasManagerOptions = {
  onEvent?: (event: BaseCanvasEvent) => void;
};

export class CanvasManager implements CanvasEventHandler {
  public options: CanvasManagerOptions;
  protected canvasMap = new Map<CanvasID, CanvasContainer>();

  constructor(protected readonly source: Node, options?: CanvasManagerOptions) {
    this.options = options ?? {};
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
      container = new CanvasContainer(id, canvas);
      this.canvasMap.set(id, container);
    }
    return container;
  }
}
