import { AsyncChunkReader, LockStrategy, LockTimeoutExceededError } from "../stream";
import {
  applyEventToContext,
  CanvasEvent,
  CanvasEventType,
  CanvasID,
  CanvasTheme,
  resetCanvasContext,
  unpackCanvasEvent,
} from "./events";
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
   * Events that are theme dependent.
   * The latest event of each theme-dependent type is stored here.
   * These must be replayed when the theme changes, since the context may have stale values for these.
   */
  private themeBuffer: CanvasEvent[] = [
    [CanvasEventType.FillStyle, 0, "black"],
    [CanvasEventType.StrokeStyle, 0, "black"],
    [CanvasEventType.ShadowColor, 0, "rgba(0, 0, 0, 0)"],
  ];

  private static ThemeTypes: readonly CanvasEventType[] = [
    CanvasEventType.FillStyle,
    CanvasEventType.StrokeStyle,
    CanvasEventType.ShadowColor,
  ];

  /**
   * Whether this canvas registration has been removed.
   * Removed canvases are still rendered and tracked (e.g. for theme updates),
   * but will not receive any new events.
   */
  private removed = false;

  constructor(
    public readonly context: OffscreenCanvasRenderingContext2D,
    public readonly contextId: number,
  ) {}

  public onEvent(evt: CanvasEvent) {
    if (this.removed) return;
    this.backBuffer.push(evt);

    if (CanvasRegistration.ThemeTypes.includes(evt[0] as CanvasEventType)) {
      for (let i = this.themeBuffer.length - 1; i >= 0; i--) {
        if (this.themeBuffer[i][0] === evt[0]) {
          this.themeBuffer[i] = evt;
          return;
        }
      }

      this.themeBuffer.push(evt);
    }
  }

  public commit() {
    if (this.removed) return;
    const tmp = this.frontBuffer;
    this.frontBuffer = this.backBuffer;
    this.backBuffer = tmp;
    this.backBuffer.length = 0;
    this.render();
  }

  public remove() {
    if (this.removed) return;
    this.commit();
    this.removed = true;
  }
    
  public render() {
    this.themeBuffer.forEach((evt) => applyEventToContext(this.context, evt, theme));
    this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
    this.frontBuffer.forEach((evt) => applyEventToContext(this.context, evt, theme));
  }
}

onmessage = async function (evt: MessageEvent<IncomingMessage>) {
  try {
    if (evt.data.type === "connection") return await enterEventLoop(evt.data.connection);
    else if (evt.data.type === "theme") return handleTheme(evt.data.colorMap);
  } catch (err: unknown) {
    handleError(err, true);
  }
};

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
  const reader = new AsyncChunkReader(
    connection.eventBuffer,
    LockStrategy.backoff({
      delayCycles: 20,
      minMs: 1,
      maxMs: 5000,
      timeoutMs: 60000,
    }),
  );

  while (true) {
    try {
      const chunk = await reader.read();
      const event = unpackCanvasEvent(chunk);
      const globalId = getGlobalId(connection.instanceId, event[1]);

      if (event[0] === CanvasEventType.ConnectionClosed) {
        /* Force commit all canvases on connection close */
        for (const reg of contexts.values()) {
          reg.commit();
        }
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

        let context: OffscreenCanvasRenderingContext2D | undefined | null = undefined;
        if (response.canvas) context = response.canvas.getContext("2d");
        else {
          /* Try to borrow an existing context. This will remove the old one */
          for (const [id, reg] of contexts) {
            if (reg.contextId === response.contextId) {
              context = reg.context;
              contexts.delete(id);
              break;
            }
          }
        }

        if (!context)
          throw new Error(
            `Couldn't get rendering context from response: ${JSON.stringify(response)}`,
          );

        resetCanvasContext(context);
        context.canvas.width = event[2];
        context.canvas.height = event[3];
        contexts.set(globalId, new CanvasRegistration(context, response.contextId));
        continue;
      }

      const registration = contexts.get(globalId);
      if (!registration) return;

      if (event[0] === CanvasEventType.Remove) {
        registration.remove();
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
      /**
       * If we don't get any data past the timeout, assume the connection is dead
       * This can happen when killing the wasi host
       */
      if (err instanceof LockTimeoutExceededError) break;
      handleError(err);
    }
  }
}
