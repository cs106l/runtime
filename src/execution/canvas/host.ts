import { Stream } from "../stream";
import { CanvasID } from "./events";
import type {
  ConnectionMessage,
  OutgoingMessage,
  ReceiveCanvasMessage,
  ThemeMessage,
} from "./worker";

import CanvasWorker from "./worker?worker&inline";

export type CanvasConnection = {
  instanceId: number;
  eventBuffer: SharedArrayBuffer;
};

export abstract class CanvasHost {
  private nextInstanceId: number = 0;
  private nextContextId: number = 0;
  private worker: Worker | null = null;

  /** Maps global canvas IDs to their corresponding HTMLCanvasElement */
  private canvasMap: Map<CanvasID, HTMLCanvasElement> = new Map();

  /**
   * Maps HTMLCanvasElement instances to their corresponding context IDs.
   * If a canvas is in this map, then its context has been transferred to the worker.
   * The associated ID is used to re-use the same canvas with the same worker.
   */
  private contextIdMap: Map<HTMLCanvasElement, number> = new Map();

  private theme: Record<string, string> = {};

  /**
   * Creates a new canvas element with the given width and height.
   * Override this method to customize how canvases are created.
   *
   * This method is called when the worker requests a new canvas.
   *
   * The returned canvas should either be a brand new canvas element (which has not had `getContext` or `transferControlToOffscreen` called on it),
   * or a canvas that has been returned previously by a call to this method on the same `CanvasHost` instance (e.g. to re-use canvases).
   *
   * @returns A new HTMLCanvasElement.
   */
  abstract createCanvas(): HTMLCanvasElement;

  /**
   * Resizes an existing canvas element to the given width and height.
   *
   * Override this method to customize how canvases are resized. By default, this method does nothing,
   * meaning that while the canvas's rendering bitmap will change size, the actual DOM element will not.
   *
   * @param canvas The canvas to resize, which was previously returned by `createCanvas`.
   * @param width The new width of the canvas in pixels
   * @param height The new height of the canvas in pixels
   */
  resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {}

  /**
   * Removes an existing canvas element.
   *
   * Override this method to customize how canvases are removed. By default, this method does nothing,
   * meaning that the canvas will remain present even after the running code requested to remove it.
   *
   * @param canvas The canvas to remove, which was previously returned by `createCanvas`.
   */
  removeCanvas(canvas: HTMLCanvasElement) {}

  /**
   * Sets the theme for the canvas host.
   *
   * @param theme An object mapping CSS color names to mapped color values.
   *
   * For example, on dark mode, you might set `{ "white": "black", "black": "white" }` to invert the colors.
   *
   * This will update and redraw all canvases managed by this host.
   */
  setTheme(theme: Record<string, string>) {
    this.theme = theme;
    const message: ThemeMessage = {
      type: "theme",
      to: "worker",
      colorMap: theme,
    };
    this.worker?.postMessage(message);
  }

  /**
   * Creates a new connection to the canvas host worker.
   *
   * This method is called internally and should not be called directly.
   *
   */
  connect(): CanvasConnection {
    const worker = this.getWorker();

    const connection: CanvasConnection = {
      instanceId: this.nextInstanceId++,
      eventBuffer: Stream.createBuffer(256 * 1024),
    };

    const connectionMessage: ConnectionMessage = {
      type: "connection",
      to: "worker",
      connection,
    };

    worker.postMessage(connectionMessage);

    return connection;
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new CanvasWorker();

    this.worker.addEventListener("message", (evt: MessageEvent<OutgoingMessage>) => {
      switch (evt.data.type) {
        case "error": {
          const error = new Error(evt.data.error.message);
          if (evt.data.error.type) error.name = evt.data.error.type;
          if (evt.data.error.stack) error.stack = evt.data.error.stack;
          throw error;
        }

        case "requestCanvas": {
          const canvas = this.createCanvas();
          this.resizeCanvas(canvas, evt.data.width, evt.data.height);
          const isNew = !this.contextIdMap.has(canvas);
          const contextId = isNew ? this.nextContextId++ : this.contextIdMap.get(canvas)!;
          this.contextIdMap.set(canvas, contextId);
          this.canvasMap.set(evt.data.globalId, canvas);

          const response: ReceiveCanvasMessage = {
            type: "receiveCanvas",
            contextId,
            canvas: isNew ? canvas.transferControlToOffscreen() : undefined,
            globalId: evt.data.globalId,
            to: "worker",
          };

          this.worker?.postMessage(response, response.canvas ? [response.canvas] : []);
          return;
        }

        case "resizeCanvas": {
          const canvas = this.canvasMap.get(evt.data.globalId);
          if (!canvas) return;
          this.resizeCanvas(canvas, evt.data.width, evt.data.height);
          return;
        }

        case "removeCanvas": {
          const canvas = this.canvasMap.get(evt.data.globalId);
          if (!canvas) return;
          this.removeCanvas(canvas);
          return;
        }
      }
    });

    this.setTheme(this.theme);
    return this.worker;
  }
}

export type CanvasRecord = {
  canvas: HTMLCanvasElement;
  stale?: boolean;
};

/**
 * A simple canvas host that appends and removes canvases to a DOM element.
 */
export class DOMCanvasHost extends CanvasHost {
  private canvases: CanvasRecord[] = [];
  private staleTimeout?: ReturnType<typeof setTimeout>;

  constructor(private parent: Node) {
    super();
  }

  createCanvas(): HTMLCanvasElement {
    const stale = this.canvases.find((c) => c.stale);
    if (stale) {
      stale.stale = false;
      return stale.canvas;
    }

    const canvas = document.createElement("canvas");
    this.parent.appendChild(canvas);
    this.canvases.push({ canvas });
    return canvas;
  }

  resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
    canvas.width = width;
    canvas.height = height;
  }

  removeCanvas(canvas: HTMLCanvasElement) {
    this.parent.removeChild(canvas);
  }

  /**
   * Removes existing canvases from the DOM.
   *
   * @param timeoutMs The number of milliseconds to wait before removing the canvases.
   *                  If non-zero, during this period, if a new canvas is requested, an existing one can be reused.
   *                  This is useful to avoid flickering associated with removing and recreating canvases.
   */
  reset(timeoutMs: number = 0) {
    clearTimeout(this.staleTimeout);
    if (timeoutMs === undefined || timeoutMs <= 0) {
      this.canvases.forEach((c) => this.removeCanvas(c.canvas));
      this.canvases.length = 0;
    } else {
      this.canvases.forEach((c) => (c.stale = true));
      this.staleTimeout = setTimeout(() => {
        this.canvases.filter((c) => c.stale).forEach((c) => this.removeCanvas(c.canvas));
        this.canvases = this.canvases.filter((c) => !c.stale);
      }, timeoutMs);
    }
  }
}
