import { AsyncChunkReader } from "../stream";
import { CanvasEvent, CanvasEventType, CanvasID, GradientType, unpackCanvasEvent } from "./events";
import { CanvasConnection } from "./host";

type WorkerToHostMessage = { to: "host" };
type HostToWorkerMessage = { to: "worker" };

export type IncomingMessage = ConnectionMessage | ReceiveCanvasMessage | ThemeMessage;
export type OutgoingMessage =
  | RequestCanvasMessage
  | RemoveCanvasMessage
  | ResizeCanvasMessage
  | WorkerErrorMessage;

export type ConnectionMessage = HostToWorkerMessage & {
  type: "connection";
  connection: CanvasConnection;
};

export type RequestCanvasMessage = WorkerToHostMessage & {
  type: "requestCanvas";
  globalId: CanvasID;
  width: number;
  height: number;
};

export type ReceiveCanvasMessage = HostToWorkerMessage & {
  type: "receiveCanvas";
  globalId: CanvasID;
  contextId: number;
  canvas?: OffscreenCanvas;
};

export type RemoveCanvasMessage = WorkerToHostMessage & {
  type: "removeCanvas";
  globalId: CanvasID;
};

export type ResizeCanvasMessage = WorkerToHostMessage & {
  type: "resizeCanvas";
  globalId: CanvasID;
  width: number;
  height: number;
};

export type WorkerErrorMessage = WorkerToHostMessage & {
  type: "error";
  error: {
    message: string;
    type?: string;
    stack?: string;
  };
  fatal?: boolean;
};

export type ThemeMessage = HostToWorkerMessage & {
  type: "theme";
  colorMap: Record<string, string>;
};

function sendMessage(message: OutgoingMessage) {
  self.postMessage(message);
}

function sendAndReceive<ResponseType extends IncomingMessage["type"]>(
  message: OutgoingMessage,
  type: ResponseType,
  pred?: (message: Extract<IncomingMessage, { type: ResponseType }>) => boolean,
): Promise<Extract<IncomingMessage, { type: ResponseType }>> {
  return new Promise((resolve) => {
    function onMessage(evt: MessageEvent<IncomingMessage>) {
      if (evt.data.type !== type) return;
      const msg = evt.data as Extract<IncomingMessage, { type: ResponseType }>;
      if (pred && !pred(msg)) return;
      self.removeEventListener("message", onMessage);
      resolve(msg);
    }

    self.addEventListener("message", onMessage);
    sendMessage(message);
  });
}

function handleError(err: unknown, fatal?: boolean) {
  let error: WorkerErrorMessage["error"];
  if (err instanceof Error) {
    error = {
      message: err.message,
      type: err.constructor.name,
      stack: err.stack,
    };
  } else {
    error = {
      message: String(err),
    };
  }

  sendMessage({ to: "host", type: "error", error, fatal });
}

function getGlobalId(instanceId: number, canvasId: CanvasID): CanvasID {
  return (canvasId + instanceId) << 8;
}

onmessage = async function (evt: MessageEvent<IncomingMessage>) {
  try {
    if (evt.data.type === "connection") return await enterEventLoop(evt.data.connection);
    else if (evt.data.type === "theme") return handleTheme(evt.data.colorMap);
  } catch (err: unknown) {
    handleError(err, true);
  }
};

class CanvasRegistration {
  /**
   * Events that have been emitted but not yet rendered.
   * Commiting will move these to the front buffer.
   */
  private backBuffer: CanvasEvent[] = [];

  /**
   * Events that have been rendered.
   * At any point in time, replaying the front buffer will produce the same results as what is currently rendered on screen.
   */
  private frontBuffer: CanvasEvent[] = [];

  /**
   * Whether this canvas registration has been removed.
   */
  public removed = false;

  constructor(
    public readonly context: OffscreenCanvasRenderingContext2D,
    public readonly contextId: number,
  ) {}

  public onEvent(evt: CanvasEvent) {
    if (this.removed) return;
    this.backBuffer.push(evt);
  }

  public commit() {
    this.frontBuffer = this.backBuffer;
    this.backBuffer.length = 0;
    this.render();
  }

  public render() {
    this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
    this.frontBuffer.forEach((evt) => applyEvent(this.context, evt, true));
  }
}

class CanvasTheme {
  public colorMap: Record<string, string>;

  constructor() {
    this.colorMap = {};
  }

  public get(color: string) {
    return this.colorMap[color] ?? color;
  }
}

/** Maps *global* IDs to their registration */
const contexts = new Map<CanvasID, CanvasRegistration>();

/** The current theme of this host to apply to all canvases */
const theme = new CanvasTheme();

function handleTheme(colorMap: Record<string, string>) {
  theme.colorMap = colorMap;

  for (const reg of contexts.values()) {
    reg.render();
  }
}

async function enterEventLoop(connection: CanvasConnection) {
  const reader = new AsyncChunkReader(connection.eventBuffer);

  while (true) {
    const chunk = await reader.read();
    try {
      const event = unpackCanvasEvent(chunk);
      const globalId = getGlobalId(connection.instanceId, event[1]);

      if (event[0] === CanvasEventType.ConnectionClosed) {
        return;
      }

      if (event[0] === CanvasEventType.Create) {
        const response = await sendAndReceive(
          {
            type: "requestCanvas",
            to: "host",
            globalId,
            width: event[2],
            height: event[3],
          },
          "receiveCanvas",
          (msg) => msg.globalId === globalId,
        );

        let context: OffscreenCanvasRenderingContext2D | undefined | null;
        if (response.canvas) context = response.canvas.getContext("2d");
        else
          context = [...contexts.values()].find(
            (reg) => reg.contextId === response.contextId,
          )?.context;

        if (!context)
          throw new Error(
            `Couldn't get rendering context from response: ${JSON.stringify(response)}`,
          );

        resetContext(context);
        contexts.set(globalId, new CanvasRegistration(context, response.contextId));
        continue;
      }

      const registration = contexts.get(globalId);
      if (!registration) return;
      if (registration.removed) return;

      if (event[0] === CanvasEventType.Remove) {
        registration.removed = true;
        sendMessage({ type: "removeCanvas", to: "host", globalId });
        continue;
      }

      if (event[0] === CanvasEventType.Commit) {
        registration.commit();
        continue;
      }

      if (event[0] === CanvasEventType.Width) {
        registration.context.canvas.width = event[2];
        sendMessage({
          type: "resizeCanvas",
          to: "host",
          globalId,
          width: event[2],
          height: registration.context.canvas.height,
        });
        continue;
      }

      if (event[0] === CanvasEventType.Height) {
        registration.context.canvas.height = event[2];
        sendMessage({
          type: "resizeCanvas",
          to: "host",
          globalId,
          width: registration.context.canvas.width,
          height: event[2],
        });
        continue;
      }

      registration.onEvent(event);
    } catch (err: unknown) {
      handleError(err);
    } finally {
      chunk.release();
    }
  }
}

/**
 * `ctx.reset()` is not valid on some platforms since it is fairly new.
 * This function does the equivalent.
 *
 * @param ctx - The context to reset
 */
function resetContext(ctx: OffscreenCanvasRenderingContext2D) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.resetTransform();
  ctx.fillStyle = "black";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 10;
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.font = "10px sans-serif";
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.direction = "ltr";
  ctx.letterSpacing = "0px";
  ctx.fontKerning = "normal";
  ctx.fontStretch = "normal";
  ctx.fontVariantCaps = "normal";
  ctx.wordSpacing = "0px";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
}

function applyEvent(ctx: OffscreenCanvasRenderingContext2D, evt: CanvasEvent, replay?: boolean) {
  switch (evt[0]) {
    case CanvasEventType.ClearRect: {
      const [_, __, ...args] = evt;
      ctx.clearRect(...args);
      break;
    }

    case CanvasEventType.FillRect: {
      const [_, __, ...args] = evt;
      ctx.fillRect(...args);
      break;
    }

    case CanvasEventType.StrokeRect: {
      const [_, __, ...args] = evt;
      ctx.strokeRect(...args);
      break;
    }

    case CanvasEventType.FillText: {
      const [_, __, ...args] = evt;
      ctx.fillText(...args);
      break;
    }

    case CanvasEventType.StrokeText: {
      const [_, __, ...args] = evt;
      ctx.strokeText(...args);
      break;
    }

    case CanvasEventType.TextRendering: {
      const [_, __, ...args] = evt;
      ctx.textRendering = args[0];
      break;
    }

    case CanvasEventType.LineWidth: {
      const [_, __, ...args] = evt;
      ctx.lineWidth = args[0];
      break;
    }

    case CanvasEventType.LineCap: {
      const [_, __, ...args] = evt;
      ctx.lineCap = args[0];
      break;
    }

    case CanvasEventType.LineJoin: {
      const [_, __, ...args] = evt;
      ctx.lineJoin = args[0];
      break;
    }

    case CanvasEventType.MiterLimit: {
      const [_, __, ...args] = evt;
      ctx.miterLimit = args[0];
      break;
    }

    case CanvasEventType.SetLineDash: {
      const [_, __, ...args] = evt;
      ctx.setLineDash(args[0]);
      break;
    }

    case CanvasEventType.LineDashOffset: {
      const [_, __, ...args] = evt;
      ctx.lineDashOffset = args[0];
      break;
    }

    case CanvasEventType.Font: {
      const [_, __, ...args] = evt;
      ctx.font = args[0];
      break;
    }

    case CanvasEventType.TextAlign: {
      const [_, __, ...args] = evt;
      ctx.textAlign = args[0];
      break;
    }

    case CanvasEventType.TextBaseline: {
      const [_, __, ...args] = evt;
      ctx.textBaseline = args[0];
      break;
    }

    case CanvasEventType.Direction: {
      const [_, __, ...args] = evt;
      ctx.direction = args[0];
      break;
    }

    case CanvasEventType.LetterSpacing: {
      const [_, __, ...args] = evt;
      ctx.letterSpacing = args[0];
      break;
    }

    case CanvasEventType.FontKerning: {
      const [_, __, ...args] = evt;
      ctx.fontKerning = args[0];
      break;
    }

    case CanvasEventType.FontStretch: {
      const [_, __, ...args] = evt;
      ctx.fontStretch = args[0];
      break;
    }

    case CanvasEventType.FontVariantCaps: {
      const [_, __, ...args] = evt;
      ctx.fontVariantCaps = args[0];
      break;
    }

    case CanvasEventType.WordSpacing: {
      const [_, __, ...args] = evt;
      ctx.wordSpacing = args[0];
      break;
    }

    case CanvasEventType.FillStyle:
    case CanvasEventType.StrokeStyle: {
      const [_, __, ...args] = evt;

      let style: string | CanvasGradient;

      if (typeof args[0] === "object") {
        const grad = args[0];
        let canvasGrad: CanvasGradient;

        if (grad.type === GradientType.Linear) canvasGrad = ctx.createLinearGradient(...grad.args);
        else if (grad.type === GradientType.Conic)
          canvasGrad = ctx.createConicGradient(...grad.args);
        else if (grad.type === GradientType.Radial)
          canvasGrad = ctx.createRadialGradient(...grad.args);
        else throw new Error(`Unknown gradient type`);

        for (const stop of grad.stops) {
          canvasGrad.addColorStop(stop.offset, theme.get(stop.color));
        }

        style = canvasGrad;
      } else {
        style = theme.get(args[0]);
      }

      if (evt[0] === CanvasEventType.StrokeStyle) ctx.strokeStyle = style;
      else ctx.fillStyle = style;
      break;
    }

    case CanvasEventType.ShadowBlur: {
      const [_, __, ...args] = evt;
      ctx.shadowBlur = args[0];
      break;
    }

    case CanvasEventType.ShadowColor: {
      const [_, __, ...args] = evt;
      ctx.shadowColor = theme.get(args[0]);
      break;
    }

    case CanvasEventType.ShadowOffsetX: {
      const [_, __, ...args] = evt;
      ctx.shadowOffsetX = args[0];
      break;
    }

    case CanvasEventType.ShadowOffsetY: {
      const [_, __, ...args] = evt;
      ctx.shadowOffsetY = args[0];
      break;
    }

    case CanvasEventType.BeginPath: {
      ctx.beginPath();
      break;
    }

    case CanvasEventType.ClosePath: {
      ctx.closePath();
      break;
    }

    case CanvasEventType.MoveTo: {
      const [_, __, ...args] = evt;
      ctx.moveTo(...args);
      break;
    }

    case CanvasEventType.LineTo: {
      const [_, __, ...args] = evt;
      ctx.lineTo(...args);
      break;
    }

    case CanvasEventType.BezierCurveTo: {
      const [_, __, ...args] = evt;
      ctx.bezierCurveTo(...args);
      break;
    }

    case CanvasEventType.QuadraticCurveTo: {
      const [_, __, ...args] = evt;
      ctx.quadraticCurveTo(...args);
      break;
    }

    case CanvasEventType.Arc: {
      const [_, __, ...args] = evt;
      ctx.arc(...args);
      break;
    }

    case CanvasEventType.ArcTo: {
      const [_, __, ...args] = evt;
      ctx.arcTo(...args);
      break;
    }

    case CanvasEventType.Ellipse: {
      const [_, __, ...args] = evt;
      ctx.ellipse(...args);
      break;
    }

    case CanvasEventType.Rect: {
      const [_, __, ...args] = evt;
      ctx.rect(...args);
      break;
    }

    case CanvasEventType.RoundRect: {
      const [_, __, ...args] = evt;
      ctx.roundRect(...args);
      break;
    }

    case CanvasEventType.Fill: {
      const [_, __, ...args] = evt;
      ctx.fill(...args);
      break;
    }

    case CanvasEventType.Stroke: {
      const [_, __, ...args] = evt;
      ctx.stroke(...args);
      break;
    }

    case CanvasEventType.Clip: {
      const [_, __, ...args] = evt;
      ctx.clip(...args);
      break;
    }

    case CanvasEventType.Rotate: {
      const [_, __, ...args] = evt;
      ctx.rotate(...args);
      break;
    }

    case CanvasEventType.Scale: {
      const [_, __, ...args] = evt;
      ctx.scale(...args);
      break;
    }

    case CanvasEventType.Translate: {
      const [_, __, ...args] = evt;
      ctx.translate(...args);
      break;
    }

    case CanvasEventType.Transform: {
      const [_, __, ...args] = evt;
      ctx.transform(...args);
      break;
    }

    case CanvasEventType.SetTransform: {
      const [_, __, ...args] = evt;
      ctx.setTransform(...args);
      break;
    }

    case CanvasEventType.ResetTransform: {
      ctx.resetTransform();
      break;
    }

    case CanvasEventType.GlobalAlpha: {
      const [_, __, ...args] = evt;
      ctx.globalAlpha = args[0];
      break;
    }

    case CanvasEventType.GlobalCompositeOperation: {
      const [_, __, ...args] = evt;
      ctx.globalCompositeOperation = args[0];
      break;
    }

    case CanvasEventType.Filter: {
      const [_, __, ...args] = evt;
      ctx.filter = args[0];
      break;
    }

    case CanvasEventType.ImageSmoothingEnabled: {
      const [_, __, ...args] = evt;
      ctx.imageSmoothingEnabled = args[0];
      break;
    }

    case CanvasEventType.ImageSmoothingQuality: {
      const [_, __, ...args] = evt;
      ctx.imageSmoothingQuality = args[0];
      break;
    }
  }
}
