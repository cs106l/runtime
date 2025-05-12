import { Stream } from "../stream";
import { CanvasID } from "./events";
import type { ConnectionMessage, OutgoingMessage, ReceiveCanvasMessage } from "./worker";

import CanvasWorker from "./worker?worker&inline";

export type CanvasConnection = {
  instanceId: number;
  eventBuffer: SharedArrayBuffer;
};

export class CanvasHost {
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

  create(width: number, height: number): HTMLCanvasElement {
    throw new Error("not supported");
  }

  resize(canvas: HTMLCanvasElement, width: number, height: number) {}

  remove(canvas: HTMLCanvasElement) {}

  connect(): CanvasConnection {
    const worker = this.getWorker();

    const connection: CanvasConnection = {
      instanceId: this.nextInstanceId++,
      eventBuffer: Stream.createBuffer(256 * 1024),
    };

    const connectionMessage: ConnectionMessage = {
      type: "connection",
      to: "worker",
      connection
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
          const canvas = this.create(evt.data.width, evt.data.height);
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

          this.worker?.postMessage(response);
          return;
        }

        case "resizeCanvas": {
          const canvas = this.canvasMap.get(evt.data.globalId);
          if (!canvas) return;
          this.resize(canvas, evt.data.width, evt.data.height);
          return;
        }

        case "removeCanvas": {
          const canvas = this.canvasMap.get(evt.data.globalId);
          if (!canvas) return;
          this.remove(canvas);
          return;
        }
      }
    });

    return this.worker;
  }
}
