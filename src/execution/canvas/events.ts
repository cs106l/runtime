import { AsyncChunkReader, ReadableChunk } from "../stream";

/**
 * Identifies a single canvas that a program can write to.
 *
 * This identifier must fit within an unsigned byte, so a program
 * can maintain up to 255 concurrent canvases.
 */
export type CanvasID = number;

export enum CanvasEventType {
  /* Canvas control */

  /**
   * Creates or reuses a new canvas DOM node with the requested identifier.
   *
   * `[width: int16] [height: int16]`
   */
  Create = 0,

  /**
   * Removes the canvas with the requested identifier from the DOM.
   */
  Remove = 1,

  /**
   * Sets the width of the canvas.
   *
   *  `[width: int16]`
   */
  Width = 2,

  /**
   * Clears the canvas and renders all events that have been queued since the last commit.
   * 
   * This is used primarily to enable flicker-free animations.
   */
  Commit = 3,

  /**
   * Sets the height of the canvas.
   *
   *  `[height: int16]`
   */
  Height = 4,

  /* Drawing rectangles */

  /**
   * [clearRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clearRect)
   *
   *  `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  ClearRect = 5,

  /**
   * [fillRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillRect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  FillRect = 6,

  /**
   * [strokeRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeRect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  StrokeRect = 7,

  /* Drawing text */

  /**
   * [fillText](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillText)
   *
   * One of:
   *  - `[0: uint8] [text: string] [x: int16] [y: int16]`
   *  - `[1: uint8] [text: string] [x: int16] [y: int16] [maxWidth: int16]`
   */
  FillText = 8,

  /**
   * [strokeText](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeText)
   *
   * One of:
   *  - `[0: uint8] [text: string] [x: int16] [y: int16]`
   *  - `[1: uint8] [text: string] [x: int16] [y: int16] [maxWidth: int16]`
   */
  StrokeText = 9,

  /**
   * Sets [textRendering](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textRendering)
   *
   * One of:
   *  - auto:               `[0: uint8]`
   *  - optimizeSpeed:      `[1: uint8]`
   *  - optimizeLegibility  `[2: uint8]`
   *  - geometricPrecision  `[3: uint8]`
   */
  TextRendering = 10,

  /* Line styles */

  /**
   * Sets [lineWidth](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineWidth)
   *
   * `[lineWidth: float32]`
   */
  LineWidth = 11,

  /**
   * Sets [lineCap](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap)
   *
   * One of:
   *  - butt:   `[0: uint8]`
   *  - round:  `[1: uint8]`
   *  - square  `[2: uint8]`
   */
  LineCap = 12,

  /**
   * Sets [lineJoin](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin)
   *
   * One of:
   *  - miter:  `[0: uint8]`
   *  - bevel:  `[1: uint8]`
   *  - round:  `[2: uint8]`
   */
  LineJoin = 13,

  /**
   * Sets [miterLimit](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/miterLimit)
   *
   * `[miterLimit: float32]`
   */
  MiterLimit = 14,

  /**
   * [setLineDash](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setLineDash)
   *
   * `[nDashes: uint8] [dashes: uint8]*`
   *
   * Notes:
   *  The `dashes` byte array is treated as an array of integers, so each dash can range from 0-255, inclusive.
   */
  SetLineDash = 15,

  /**
   * Sets [lineDashOffset](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineDashOffset)
   *
   * `[lineDashOffset: float32]`
   */
  LineDashOffset = 16,

  /* Text styles */

  /**
   * Sets [font](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/font)
   *
   * `[font: string]`
   */
  Font = 17,

  /**
   * Sets [textAlign](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textAlign)
   *
   * One of:
   *  - start:    `[0: uint8]`
   *  - end:      `[1: uint8]`
   *  - left:     `[2: uint8]`
   *  - right:    `[3: uint8]`
   *  - center:   `[4: uint8]`
   */
  TextAlign = 18,

  /**
   * Sets [textBaseline](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textBaseline)
   *
   * One of:
   *  - alphabetic:     `[0: uint8]`
   *  - hanging:        `[1: uint8]`
   *  - top:            `[2: uint8]`
   *  - middle:         `[3: uint8]`
   *  - bottom:         `[4: uint8]`
   *  - ideographic:    `[5: uint8]`
   */
  TextBaseline = 19,

  /**
   * Sets [direction](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/direction)
   *
   * One of:
   *  - inherit:    `[0: uint8]`
   *  - ltr:        `[1: uint8]`
   *  - rtl:        `[2: uint8]`
   */
  Direction = 20,

  /**
   * Sets [letterSpacing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/letterSpacing)
   *
   * `[letterSpacing: string]`
   */
  LetterSpacing = 21,

  /**
   * Sets [fontKerning](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fontKerning)
   *
   * One of:
   *  - auto:     `[0: uint8]`
   *  - normal:   `[1: uint8]`
   *  - none:     `[2: uint8]`
   */
  FontKerning = 22,

  /**
   * Sets [fontStretch](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fontStretch)
   *
   * One of:
   *  - normal:           `[0: uint8]`
   *  - ultra-condensed:  `[1: uint8]`
   *  - extra-condensed:  `[2: uint8]`
   *  - condensed:        `[3: uint8]`
   *  - semi-condensed:   `[4: uint8]`
   *  - semi-expanded:    `[5: uint8]`
   *  - expanded:         `[6: uint8]`
   *  - extra-expanded:   `[7: uint8]`
   *  - ultra-expanded:   `[8: uint8]`
   */
  FontStretch = 23,

  /**
   * Sets [fontVariantCaps](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fontVariantCaps)
   *
   * One of:
   *  - normal:           `[0: uint8]`
   *  - small-caps:       `[1: uint8]`
   *  - all-small-caps:   `[2: uint8]`
   *  - petite-caps:      `[3: uint8]`
   *  - all-petite-caps:  `[4: uint8]`
   *  - unicase:          `[5: uint8]`
   *  - titling-caps:     `[6: uint8]`
   */
  FontVariantCaps = 24,

  /**
   * Sets [wordSpacing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/wordSpacing)
   *
   * `[wordSpacing: string]`
   */
  WordSpacing = 25,

  /* Fill and stroke styles */

  /**
   * Sets [fillStyle](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillStyle)
   *
   * One of:
   *  - `[0: uint8] [color: string]`
   *  - `[1: uint8] [grad: gradient]`
   */
  FillStyle = 26,

  /**
   * Sets [strokeStyle](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeStyle)
   *
   * One of:
   *  - `[0: uint8] [color: string]`
   *  - `[1: uint8] [grad: gradient]`
   */
  StrokeStyle = 27,

  /* Shadows */

  /**
   * Sets [shadowBlur](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowBlur)
   *
   * `[shadowBlur: float32]`
   */
  ShadowBlur = 28,

  /**
   * Sets [shadowColor](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowColor)
   *
   * `[shadowColor: string]`
   */
  ShadowColor = 29,

  /**
   * Sets [shadowOffsetX](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowOffsetX)
   *
   * `[shadowOffsetX: float32]`
   */
  ShadowOffsetX = 30,

  /**
   * Sets [shadowOffsetY](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowOffsetY)
   *
   * `[shadowOffsetY: float32]`
   */
  ShadowOffsetY = 31,

  /* Paths */

  /**
   * [beginPath](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/beginPath)
   */
  BeginPath = 32,

  /**
   * [closePath](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/closePath)
   */
  ClosePath = 33,

  /**
   * [moveTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/moveTo)
   *
   * `[x: int16] [y: int16]`
   */
  MoveTo = 34,

  /**
   * [lineTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/moveTo)
   *
   * `[x: int16] [y: int16]`
   */
  LineTo = 35,

  /**
   * [bezierCurveTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/bezierCurveTo)
   *
   * `[cp1x: int16] [cp1y: int16] [cp2x: int16] [cp2y: int16] [x: int16] [y: int16]`
   */
  BezierCurveTo = 36,

  /**
   * [quadraticCurveTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/quadraticCurveTo)
   *
   * `[cpx: int16] [cpy: int16] [x: int16] [y: int16]`
   */
  QuadraticCurveTo = 37,

  /**
   * [arc](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arc)
   *
   * `[x: int16] [y: int16] [radius: int16] [startAngle: float32] [endAngle: float32] [counterclockwise: bool]`
   */
  Arc = 38,

  /**
   * [arcTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arcTo)
   *
   * `[x1: int16] [y1: int16] [x2: int16] [y2: int16] [radius: int16]`
   */
  ArcTo = 39,

  /**
   * [ellipse](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/ellipse)
   *
   * `[x: int16] [y: int16] [radiusX: int16] [radiusY: int16] [rotation: float32] [startAngle: float32] [endAngle: float32] [counterclockwise: bool]`
   */
  Ellipse = 40,

  /**
   * [rect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/rect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  Rect = 41,

  /**
   * [roundRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16] [nRadii ∈ [1,2,3,4]: uint8] [radius: int16]+`
   */
  RoundRect = 42,

  /* Drawing paths */

  /**
   * [fill](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fill)
   *
   * One of:
   *  - fillRule = nonzero:   `[0: uint8]`
   *  - fillRule = evenodd:   `[1: uint8]`
   */
  Fill = 43,

  /**
   * [stroke](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/stroke)
   */
  Stroke = 44,

  /**
   * [clip](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip)
   *
   * One of:
   *  - fillRule = nonzero:   `[0: uint8]`
   *  - fillRule = evenodd:   `[1: uint8]`
   */
  Clip = 45,

  /* Transformations */

  /**
   * [rotate](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/rotate)
   *
   * `[angle: float32]`
   */
  Rotate = 46,

  /**
   * [scale](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/scale)
   *
   * `[x: float32] [y: float32]`
   */
  Scale = 47,

  /**
   * [translate](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/translate)
   *
   * `[x: float32] [y: float32]`
   */
  Translate = 48,

  /**
   * [transform](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform)
   *
   * `[m11: float32] [m12: float32] [m21: float32] [m22: float32] [m31: float32] [m32: float32]`
   */
  Transform = 49,

  /**
   * [setTransform](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform)
   *
   * `[m11: float32] [m12: float32] [m21: float32] [m22: float32] [m31: float32] [m32: float32]`
   */
  SetTransform = 50,

  /**
   * [resetTransform](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/resetTransform)
   */
  ResetTransform = 51,

  /* Compositing */

  /**
   * Sets [globalAlpha](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalAlpha)
   *
   * `[globalAlpha: float32]`
   */
  GlobalAlpha = 52,

  /**
   * Sets [globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
   *
   * One of:
   *  - source-over:      `[0: uint8]`
   *  - source-in:        `[1: uint8]`
   *  - source-out:       `[2: uint8]`
   *  - source-atop:      `[3: uint8]`
   *  - destination-over: `[4: uint8]`
   *  - destination-in:   `[5: uint8]`
   *  - destination-out:  `[6: uint8]`
   *  - destination-atop: `[7: uint8]`
   *  - lighter:          `[8: uint8]`
   *  - copy:             `[9: uint8]`
   *  - xor:              `[10: uint8]`
   *  - multiply:         `[11: uint8]`
   *  - screen:           `[12: uint8]`
   *  - overlay:          `[13: uint8]`
   *  - darken:           `[14: uint8]`
   *  - lighten:          `[15: uint8]`
   *  - color-dodge:      `[16: uint8]`
   *  - color-burn:       `[17: uint8]`
   *  - hard-light:       `[18: uint8]`
   *  - soft-light:       `[19: uint8]`
   *  - difference:       `[20: uint8]`
   *  - exclusion:        `[21: uint8]`
   *  - hue:              `[22: uint8]`
   *  - saturation:       `[23: uint8]`
   *  - color:            `[24: uint8]`
   *  - luminosity:       `[25: uint8]`
   */
  GlobalCompositeOperation = 53,

  /* Filters */

  /**
   * Sets [filter](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter)
   *
   * `[filter: string]`
   */
  Filter = 54,

  /* Drawing images */

  /**
   * Creates an image that can be rendered on the canvas.
   *
   * This method does not have a close analogue in CanvasRenderingContext2D.
   * It is used to create and store images, which can be rendered later
   * via `DrawImage`.
   *
   * Resetting the canvas does not clear any previously created images.
   *
   * `[imageId: uint16] [mime: string] [data: bytes]`
   *
   * - `imageId` is a unique identifier that can be passed to `DrawImage`.
   * - `mime` is one of the IANA image MIME types (https://www.iana.org/assignments/media-types/media-types.xhtml#image),
   *    for example, "png" or "jpeg"
   * - `data` is the raw binary of the image
   */
  CreateImage = 55,

  /**
   * [drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)
   *
   * `id` should match the `id` of an image previously created with `CreateImage`.
   *
   * One of:
   *  - `[0: uint8] [id: uint16] [dx: int16] [dy: int16]`
   *  - `[1: uint8] [id: uint16] [dx: int16] [dy: int16] [dWidth: int16] [dHeight: int16]`
   *  - `[2: uint8] [id: uint16] [sx: int16] [sy: int16] [sWidth: int16] [sHeight: int16] [dx: int16] [dy: int16] [dWidth: int16] [dHeight: int16]`
   */
  DrawImage = 56,

  /**
   * Sets [imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvasRenderingContext2D)
   *
   * `[imageSmoothingEnabled: bool]`
   */
  ImageSmoothingEnabled = 57,

  /**
   * Sets [imageSmoothingQuality](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality)
   *
   * One of:
   *  - low:    `[0: uint8]`
   *  - medium: `[1: uint8]`
   *  - high:   `[2: uint8]`
   */
  ImageSmoothingQuality = 58,

  /**
   * Closes the event stream between the running program and the renderer thread.
   * After this message is received, no more messages will be sent and the connection may be closed.
   */
  ConnectionClosed = 59,
}

export enum GradientType {
  Linear = 0,
  Conic = 1,
  Radial = 2,
}

/**
 * Describes a canvas gradient object.
 *
 * `gradient` encoding:
 *  `[stops: uint8] ([offset: float32] [color: string])*`
 *
 * Followed by one of the following, depending on the gradient type:
 *  - Linear:   `[type: 0] [x0: int16] [y0: int16] [x1: int16] [y1: int16]`
 *  - Conic:    `[type: 1] [x: int16] [y: int16] [angle: float32]`
 *  - Radial:   `[type: 2] [x0: int16] [y0: int16] [r0: int16] [x1: int16] [y1: int16] [r1: int16]`
 */
export type Gradient = {
  stops: { offset: number; color: string }[];
} & (
  | { type: GradientType.Linear; args: [x0: number, y0: number, x1: number, y1: number] }
  | { type: GradientType.Conic; args: [x: number, y: number, angle: number] }
  | {
      type: GradientType.Radial;
      args: [x0: number, y0: number, r0: number, x1: number, y1: number, r1: number];
    }
);

const textRendering = [
  "auto",
  "optimizeSpeed",
  "optimizeLegibility",
  "geometricPrecision",
] as const;

const lineCap = ["butt", "round", "square"] as const;

const lineJoin = ["miter", "bevel", "round"] as const;

const textAlign = ["start", "end", "left", "right", "center"] as const;

const textBaseline = ["alphabetic", "hanging", "top", "middle", "bottom", "ideographic"] as const;

const direction = ["inherit", "ltr", "rtl"] as const;

const fontKerning = ["auto", "normal", "none"] as const;

const fontStretch = [
  "normal",
  "ultra-condensed",
  "extra-condensed",
  "condensed",
  "semi-condensed",
  "semi-expanded",
  "expanded",
  "extra-expanded",
  "ultra-expanded",
] as const;

const fontVariantCaps = [
  "normal",
  "small-caps",
  "all-small-caps",
  "petite-caps",
  "all-petite-caps",
  "unicase",
  "titling-caps",
] as const;

const fillRule = ["nonzero", "evenodd"] as const;

const globalCompositeOperation = [
  "source-over",
  "source-in",
  "source-out",
  "source-atop",
  "destination-over",
  "destination-in",
  "destination-out",
  "destination-atop",
  "lighter",
  "copy",
  "xor",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;

const imageSmoothingQuality = ["low", "medium", "high"] as const;

export type CanvasEvent = Awaited<ReturnType<typeof unpackCanvasEvent>>;

export function unpackCanvasEvent(chunk: ReadableChunk) {
  const type: CanvasEventType = chunk.uint8();
  const id: CanvasID = chunk.uint8();

  switch (type) {
    case CanvasEventType.Create:
      return [type, id, chunk.int16(), chunk.int16()] as const;

    case CanvasEventType.Remove:
      return [type, id] as const;

    case CanvasEventType.Commit:
      return [type, id] as const;

    case CanvasEventType.Width:
      return [type, id, chunk.int16()] as const;

    case CanvasEventType.Height:
      return [type, id, chunk.int16()] as const;

    case CanvasEventType.ClearRect:
    case CanvasEventType.FillRect:
    case CanvasEventType.StrokeRect:
    case CanvasEventType.Rect:
      return [type, id, chunk.int16(), chunk.int16(), chunk.int16(), chunk.int16()] as const;

    case CanvasEventType.FillText:
    case CanvasEventType.StrokeText:
      const hasMaxWidth = chunk.uint8() > 0;
      return [
        type,
        id,
        chunk.string(),
        chunk.int16(),
        chunk.int16(),
        hasMaxWidth ? chunk.int16() : undefined,
      ] as const;

    case CanvasEventType.TextRendering:
      return [type, id, textRendering[chunk.uint8()]] as const;

    case CanvasEventType.LineWidth:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.LineCap:
      return [type, id, lineCap[chunk.uint8()]] as const;

    case CanvasEventType.LineJoin:
      return [type, id, lineJoin[chunk.uint8()]] as const;

    case CanvasEventType.MiterLimit:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.SetLineDash:
      const nDashes = chunk.uint8();
      const dashes: number[] = [];
      for (let i = 0; i < nDashes; i++) {
        dashes.push(chunk.uint8());
      }
      return [type, id, dashes] as const;

    case CanvasEventType.LineDashOffset:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.Font:
      return [type, id, chunk.string()] as const;

    case CanvasEventType.TextAlign:
      return [type, id, textAlign[chunk.uint8()]] as const;

    case CanvasEventType.TextBaseline:
      return [type, id, textBaseline[chunk.uint8()]] as const;

    case CanvasEventType.Direction:
      return [type, id, direction[chunk.uint8()]] as const;

    case CanvasEventType.LetterSpacing:
      return [type, id, chunk.string()] as const;

    case CanvasEventType.FontKerning:
      return [type, id, fontKerning[chunk.uint8()]] as const;

    case CanvasEventType.FontStretch:
      return [type, id, fontStretch[chunk.uint8()]] as const;

    case CanvasEventType.FontVariantCaps:
      return [type, id, fontVariantCaps[chunk.uint8()]] as const;

    case CanvasEventType.WordSpacing:
      return [type, id, chunk.string()] as const;

    case CanvasEventType.FillStyle:
    case CanvasEventType.StrokeStyle:
      const isGradient = chunk.uint8() > 0;
      if (!isGradient) return [type, id, chunk.string()] as const;

      const stops: Gradient["stops"] = [];
      const nStops = chunk.uint8();
      for (let i = 0; i < nStops; i++) {
        const offset = chunk.float32();
        const color = chunk.string();
        stops.push({ offset, color });
      }

      const gradType: GradientType = chunk.uint8();
      let gradient: Gradient;

      if (gradType === GradientType.Linear) {
        gradient = {
          type: gradType,
          args: [chunk.int16(), chunk.int16(), chunk.int16(), chunk.int16()],
          stops,
        };
      } else if (gradType === GradientType.Conic) {
        gradient = {
          type: gradType,
          args: [chunk.int16(), chunk.int16(), chunk.float32()],
          stops,
        };
      } else if (gradType === GradientType.Radial) {
        gradient = {
          type: gradType,
          args: [
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
          ],
          stops,
        };
      } else {
        throw new Error(`Unknown gradient type: ${gradType}`);
      }

      return [type, id, gradient] as const;

    case CanvasEventType.ShadowBlur:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.ShadowColor:
      return [type, id, chunk.string()] as const;

    case CanvasEventType.ShadowOffsetX:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.ShadowOffsetY:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.BeginPath:
    case CanvasEventType.ClosePath:
      return [type, id] as const;

    case CanvasEventType.MoveTo:
    case CanvasEventType.LineTo:
      return [type, id, chunk.int16(), chunk.int16()] as const;

    case CanvasEventType.BezierCurveTo:
      return [
        type,
        id,
        chunk.int16(),
        chunk.int16(),
        chunk.int16(),
        chunk.int16(),
        chunk.int16(),
        chunk.int16(),
      ] as const;

    case CanvasEventType.QuadraticCurveTo:
      return [
        type,
        id,
        chunk.int16(), // cpx
        chunk.int16(), // cpy
        chunk.int16(), // x
        chunk.int16(), // y
      ] as const;

    case CanvasEventType.Arc:
      return [
        type,
        id,
        chunk.int16(), // x
        chunk.int16(), // y
        chunk.int16(), // radius
        chunk.float32(), // startAngle
        chunk.float32(), // endAngle
        chunk.bool(), // counterclockwise
      ] as const;

    case CanvasEventType.ArcTo:
      return [
        type,
        id,
        chunk.int16(), // x1
        chunk.int16(), // y1
        chunk.int16(), // x2
        chunk.int16(), // y2
        chunk.int16(), // radius
      ] as const;

    case CanvasEventType.Ellipse:
      return [
        type,
        id,
        chunk.int16(), // x
        chunk.int16(), // y
        chunk.int16(), // radiusX
        chunk.int16(), // radiusY
        chunk.float32(), // rotation
        chunk.float32(), // startAngle
        chunk.float32(), // endAngle
        chunk.bool(), // counterclockwise
      ] as const;

    case CanvasEventType.RoundRect: {
      const x = chunk.int16();
      const y = chunk.int16();
      const width = chunk.int16();
      const height = chunk.int16();
      const nRadii = chunk.uint8();
      const radii: number[] = [];
      for (let i = 0; i < nRadii; i++) {
        radii.push(chunk.int16());
      }
      return [type, id, x, y, width, height, radii] as const;
    }

    case CanvasEventType.Fill:
    case CanvasEventType.Clip:
      return [type, id, fillRule[chunk.uint8()]] as const;

    case CanvasEventType.Stroke:
      return [type, id] as const;

    case CanvasEventType.Rotate:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.Scale:
    case CanvasEventType.Translate:
      return [type, id, chunk.float32(), chunk.float32()] as const;

    case CanvasEventType.Transform:
    case CanvasEventType.SetTransform:
      return [
        type,
        id,
        chunk.float32(),
        chunk.float32(),
        chunk.float32(),
        chunk.float32(),
        chunk.float32(),
        chunk.float32(),
      ] as const;

    case CanvasEventType.ResetTransform:
      return [type, id] as const;

    case CanvasEventType.GlobalAlpha:
      return [type, id, chunk.float32()] as const;

    case CanvasEventType.GlobalCompositeOperation:
      return [type, id, globalCompositeOperation[chunk.uint8()]] as const;

    case CanvasEventType.Filter:
      return [type, id, chunk.string()] as const;

    case CanvasEventType.CreateImage: {
      const imageId = chunk.uint16();
      const imageType = chunk.string();
      const imageBytes = chunk.bytes();
      return [type, id, imageId, imageType, imageBytes] as const;
    }

    case CanvasEventType.ImageSmoothingEnabled:
      return [type, id, chunk.bool()] as const;

    case CanvasEventType.ImageSmoothingQuality:
      return [type, id, imageSmoothingQuality[chunk.uint8()]] as const;

    case CanvasEventType.DrawImage: {
      const overload = chunk.uint8();
      const imageId = chunk.uint16();
      switch (overload) {
        case 0:
          return [type, id, imageId, chunk.int16(), chunk.int16()] as const;
        case 1:
          return [
            type,
            id,
            imageId,
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
          ] as const;
        case 2:
          return [
            type,
            id,
            imageId,
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
            chunk.int16(),
          ] as const;
      }
    }

    case CanvasEventType.ConnectionClosed:
      return [type, id] as const;

    default:
      throw new Error(`Unknown canvas event type: ${type}`);
  }
}

export class CanvasTheme {
  public colorMap: Record<string, string>;

  constructor() {
    this.colorMap = {};
  }

  public get(color: string) {
    return this.colorMap[color] ?? color;
  }
}

export function applyEventToContext(ctx: OffscreenCanvasRenderingContext2D, evt: CanvasEvent, theme: CanvasTheme) {
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


/**
 * `ctx.reset()` is not valid on some platforms since it is fairly new.
 * This function does the equivalent.
 * 
 * This function defines unambiguously the default context which client implementations
 * can rely on to define their own local starting states.
 *
 * @param ctx - The context to reset
 */
export function resetCanvasContext(ctx: OffscreenCanvasRenderingContext2D) {
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