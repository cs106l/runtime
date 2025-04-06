import { WASIDrive, WASIFS } from "@cs106l/wasi";
import { CanvasOutput } from ".";

export type CanvasID = string;

export type CanvasDriveOptions = Omit<CanvasOutput, "create"> & {
  requestCanvas: (id: CanvasID, width: number, height: number) => void;
};

export class CanvasDrive extends WASIDrive {
  private contexts: Map<CanvasID, OffscreenCanvasRenderingContext2D> = new Map();

  constructor(private config: CanvasDriveOptions, fs?: WASIFS) {
    super(fs ?? {});
  }

  public receiveCanvas(id: CanvasID, canvas: OffscreenCanvas) {
    const context = canvas.getContext("2d");
    if (context === null) console.warn(`Couldn't initialize canvas '${id}' rendering context: already initialized`);
    else this.contexts.set(id, context);
  }
}
