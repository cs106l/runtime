import { DataStreamReader } from "../stream";

/**
 * Identifies a single canvas that a program can write to.
 *
 * This identifier must fit within an unsigned byte, so a program
 * can maintain up to 255 concurrent canvases.
 */
export type CanvasId = number;

export enum CanvasEventType {
  /* Canvas control */

  /**
   * Creates or reuses a new canvas DOM node with the requested identifier.
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
   * Sets the height of the canvas.
   *
   *  `[height: int16]`
   */
  Height = 3,

  /* Drawing rectangles */

  /**
   * [clearRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clearRect)
   *
   *  `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  ClearRect = 4,

  /**
   * [fillRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillRect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  FillRect = 5,

  /**
   * [strokeRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeRect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  StrokeRect = 6,

  /* Drawing text */

  /**
   * [fillText](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillText)
   *
   * One of:
   *  - `[0: uint8] [text: string] [x: int16] [y: int16]`
   *  - `[1: uint8] [text: string] [x: int16] [y: int16] [maxWidth: int16]`
   */
  FillText = 7,

  /**
   * [strokeText](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeText)
   *
   * One of:
   *  - `[0: uint8] [text: string] [x: int16] [y: int16]`
   *  - `[1: uint8] [text: string] [x: int16] [y: int16] [maxWidth: int16]`
   */
  StrokeText = 8,

  /**
   * Sets [textRendering](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textRendering)
   *
   * One of:
   *  - auto:               `[0: uint8]`
   *  - optimizeSpeed:      `[1: uint8]`
   *  - optimizeLegibility  `[2: uint8]`
   *  - geometricPrecision  `[3: uint8]`
   */
  TextRendering = 9,

  /* Line styles */

  /**
   * Sets [lineWidth](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineWidth)
   *
   * `[lineWidth: float32]`
   */
  LineWidth = 10,

  /**
   * Sets [lineCap](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineCap)
   *
   * One of:
   *  - butt:   `[0: uint8]`
   *  - round:  `[1: uint8]`
   *  - square  `[2: uint8]`
   */
  LineCap = 11,

  /**
   * Sets [lineJoin](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin)
   *
   * One of:
   *  - miter:  `[0: uint8]`
   *  - bevel:  `[1: uint8]`
   *  - round:  `[2: uint8]`
   */
  LineJoin = 12,

  /**
   * Sets [miterLimit](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/miterLimit)
   *
   * `[miterLimit: float32]`
   */
  MiterLimit = 13,

  /**
   * [setLineDash](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setLineDash)
   *
   * `[dashes: bytes]`
   *
   * Notes:
   *  The `dashes` byte array is treated as an array of integers, so each dash can range from 0-255, inclusive.
   */
  SetLineDash = 14,

  /**
   * Sets [lineDashOffset](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineDashOffset)
   *
   * `[lineDashOffset: float32]`
   */
  LineDashOffset = 15,

  /* Text styles */

  /**
   * Sets [font](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/font)
   *
   * `[font: string]`
   */
  Font = 16,

  /**
   * Sets [textAlign](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/textAlign)
   *
   * One of:
   *  - left:     `[0: uint8]`
   *  - right:    `[1: uint8]`
   *  - center:   `[2: uint8]`
   *  - start:    `[3: uint8]`
   *  - end:      `[4: uint8]`
   */
  TextAlign = 17,

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
  TextBaseline = 18,

  /**
   * Sets [direction](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/direction)
   *
   * One of:
   *  - inherit:    `[0: uint8]`
   *  - ltr:        `[1: uint8]`
   *  - rtl:        `[2: uint8]`
   */
  Direction = 19,

  /**
   * Sets [letterSpacing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/letterSpacing)
   *
   * `[letterSpacing: string]`
   */
  LetterSpacing = 20,

  /**
   * Sets [fontKerning](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fontKerning)
   *
   * One of:
   *  - auto:     `[0: uint8]`
   *  - normal:   `[1: uint8]`
   *  - none:     `[2: uint8]`
   */
  FontKerning = 21,

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
  FontStretch = 22,

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
  FontVariantCaps = 23,

  /**
   * Sets [wordSpacing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/wordSpacing)
   *
   * `[wordSpacing: string]`
   */
  WordSpacing = 24,

  /* Fill and stroke styles */

  /**
   * Sets [fillStyle](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fillStyle)
   *
   * One of:
   *  - `[0: uint8] [color: string]`
   *  - `[1: uint8] [grad: gradient]`
   */
  FillStyle = 25,

  /**
   * Sets [strokeStyle](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/strokeStyle)
   *
   * One of:
   *  - `[0: uint8] [color: string]`
   *  - `[1: uint8] [grad: gradient]`
   */
  StrokeStyle = 26,

  /* Shadows */

  /**
   * Sets [shadowBlur](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowBlur)
   *
   * `[shadowBlur: float32]`
   */
  ShadowBlur = 27,

  /**
   * Sets [shadowColor](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowColor)
   *
   * `[shadowColor: string]`
   */
  ShadowColor = 28,

  /**
   * Sets [shadowOffsetX](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowOffsetX)
   *
   * `[shadowOffsetX: float32]`
   */
  ShadowOffsetX = 29,

  /**
   * Sets [shadowOffsetY](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/shadowOffsetY)
   *
   * `[shadowOffsetY: float32]`
   */
  ShadowOffsetY = 30,

  /* Paths */

  /**
   * [beginPath](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/beginPath)
   */
  BeginPath = 31,

  /**
   * [closePath](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/closePath)
   */
  ClosePath = 32,

  /**
   * [moveTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/moveTo)
   *
   * `[x: int16] [y: int16]`
   */
  MoveTo = 33,

  /**
   * [lineTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/moveTo)
   *
   * `[x: int16] [y: int16]`
   */
  LineTo = 34,

  /**
   * [bezierCurveTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/bezierCurveTo)
   *
   * `[cp1x: int16] [cp1y: int16] [cp2x: int16] [cp2y: int16] [x: int16] [y: int16]`
   */
  BezierCurveTo = 35,

  /**
   * [quadraticCurveTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/quadraticCurveTo)
   *
   * `[cpx: int16] [cpy: int16] [x: int16] [y: int16]`
   */
  QuadraticCurveTo = 36,

  /**
   * [arc](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arc)
   *
   * `[x: int16] [y: int16] [radius: int16] [startAngle: float32] [endAngle: float32] [counterclockwise: bool]`
   */
  Arc = 37,

  /**
   * [arcTo](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/arcTo)
   *
   * `[x1: int16] [y1: int16] [x2: int16] [y2: int16] [radius: int16]`
   */
  ArcTo = 38,

  /**
   * [ellipse](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/ellipse)
   *
   * `[x: int16] [y: int16] [radiusX: int16] [radiusY: int16] [rotation: float32] [startAngle: float32] [endAngle: float32] [counterclockwise: bool]`
   */
  Ellipse = 39,

  /**
   * [rect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/rect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16]`
   */
  Rect = 40,

  /**
   * [roundRect](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect)
   *
   * `[x: int16] [y: int16] [width: int16] [height: int16] [nRadii ∈ [1,2,3,4]: uint8] [radius: uint16]+`
   */
  RoundRect = 41,

  /* Drawing paths */

  /**
   * [fill](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fill)
   *
   * One of:
   *  - fillRule = nonzero:   `[0: uint8]`
   *  - fillRule = evenodd:   `[1: uint8]`
   */
  Fill = 42,

  /**
   * [stroke](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/stroke)
   */
  Stroke = 43,

  /**
   * [clip](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip)
   *
   * One of:
   *  - fillRule = nonzero:   `[0: uint8]`
   *  - fillRule = evenodd:   `[1: uint8]`
   */
  Clip = 44,

  /* Transformations */

  /**
   * [rotate](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/rotate)
   *
   * `[angle: float32]`
   */
  Rotate = 45,

  /**
   * [scale](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/scale)
   *
   * `[x: float32] [y: float32]`
   */
  Scale = 46,

  /**
   * [translate](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/translate)
   *
   * `[x: float32] [y: float32]`
   */
  Translate = 47,

  /**
   * [transform](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform)
   *
   * `[m11: float32] [m12: float32] [m21: float32] [m22: float32] [m31: float32] [m32: float32]`
   */
  Transform = 48,

  /**
   * [setTransform](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform)
   *
   * `[m11: float32] [m12: float32] [m21: float32] [m22: float32] [m31: float32] [m32: float32]`
   */
  SetTransform = 49,

  /**
   * [resetTransform](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/resetTransform)
   */
  ResetTransform = 50,

  /* Compositing */

  /**
   * Sets [globalAlpha](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalAlpha)
   *
   * `[globalAlpha: float32]`
   */
  GlobalAlpha = 51,

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
  GlobalCompositeOperation = 52,

  /* Canvas State */

  /**
   * [save](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/save)
   */
  Save = 53,

  /**
   * [restore](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/restore)
   */
  Restore = 54,

  /**
   * [reset](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/reset)
   *
   * This operation is newly available and may not be supported in every browser.
   */
  Reset = 55,

  /* Filters */

  /**
   * Sets [filter](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter)
   *
   * `[filter: string]`
   */
  Filter = 56,

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
  CreateImage = 57,

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
  DrawImage = 58,

  /**
   * Sets [imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvasRenderingContext2D)
   * 
   * `[imageSmoothingEnabled: bool]`
   */
  ImageSmoothingEnabled = 59,

  /**
   * Sets [imageSmoothingQuality](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality)
   * 
   * One of:
   *  - low:    `[0: uint8]`
   *  - medium: `[1: uint8]`
   *  - high:   `[2: uint8]`
   */
  ImageSmoothingQuality = 60,

  /**
   * Closes the event stream between the running program and the renderer thread.
   * After this message is received, no more messages will be sent and the connection may be closed.
   */
  ConnectionClosed = 61,
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
 *  `[type: uint8] [stops: uint8] ([offset: float32] [color: string])*`
 */
export type Gradient = {
  type: GradientType;
  stops: { offset: number; color: string }[];
};

const textRendering = [
  "auto",
  "optimizeSpeed",
  "optimizeLegibility",
  "geometricPrecision",
] as const;

const lineCap = ["butt", "round", "square"] as const;

const lineJoin = ["miter", "bevel", "round"] as const;

const textAlign = ["left", "right", "center", "start", "end"] as const;

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

const imageSmoothingQuality = [
  "low",
  "medium",
  "high",
] as const;

export type CanvasEvent = Awaited<ReturnType<typeof readCanvasEventAsync>>;

export async function readCanvasEventAsync(stream: DataStreamReader<true>) {
  const type: CanvasEventType = await stream.uint8();
  const id: CanvasId = await stream.uint8();

  switch (type) {
    case CanvasEventType.Create:
      return [type, id] as const;

    case CanvasEventType.Remove:
      return [type, id] as const;

    case CanvasEventType.Width:
      return [type, id, await stream.int16()] as const;

    case CanvasEventType.Height:
      return [type, id, await stream.int16()] as const;

    case CanvasEventType.ClearRect:
    case CanvasEventType.FillRect:
    case CanvasEventType.StrokeRect:
    case CanvasEventType.Rect:
      return [
        type,
        id,
        await stream.int16(),
        await stream.int16(),
        await stream.int16(),
        await stream.int16(),
      ] as const;

    case CanvasEventType.FillText:
    case CanvasEventType.StrokeText:
      const hasMaxWidth = (await stream.uint8()) > 0;
      return [
        type,
        id,
        await stream.string(),
        await stream.int16(),
        await stream.int16(),
        hasMaxWidth ? await stream.int16() : undefined,
      ] as const;

    case CanvasEventType.TextRendering:
      return [type, id, textRendering[await stream.uint8()]] as const;

    case CanvasEventType.LineWidth:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.LineCap:
      return [type, id, lineCap[await stream.uint8()]] as const;

    case CanvasEventType.LineJoin:
      return [type, id, lineJoin[await stream.uint8()]] as const;

    case CanvasEventType.MiterLimit:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.SetLineDash:
      return [type, id, Array.from(await stream.bytes())] as const;

    case CanvasEventType.LineDashOffset:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.Font:
      return [type, id, await stream.string()] as const;

    case CanvasEventType.TextAlign:
      return [type, id, textAlign[await stream.uint8()]] as const;

    case CanvasEventType.TextBaseline:
      return [type, id, textBaseline[await stream.uint8()]] as const;

    case CanvasEventType.Direction:
      return [type, id, direction[await stream.uint8()]] as const;

    case CanvasEventType.LetterSpacing:
      return [type, id, await stream.string()] as const;

    case CanvasEventType.FontKerning:
      return [type, id, fontKerning[await stream.uint8()]] as const;

    case CanvasEventType.FontStretch:
      return [type, id, fontStretch[await stream.uint8()]] as const;

    case CanvasEventType.FontVariantCaps:
      return [type, id, fontVariantCaps[await stream.uint8()]] as const;

    case CanvasEventType.WordSpacing:
      return [type, id, await stream.string()];

    case CanvasEventType.FillStyle:
    case CanvasEventType.StrokeStyle:
      const isGradient = (await stream.uint8()) > 0;
      if (!isGradient) return [type, id, await stream.string()] as const;
      const gradType: GradientType = await stream.uint8();
      const stops: Gradient["stops"] = [];
      const nStops = await stream.uint8();
      for (let i = 0; i < nStops; i++) {
        const offset = await stream.float32();
        const color = await stream.string();
        stops.push({ offset, color });
      }
      const gradient: Gradient = { type: gradType, stops };
      return [type, id, gradient] as const;

    case CanvasEventType.ShadowBlur:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.ShadowColor:
      return [type, id, await stream.string()] as const;

    case CanvasEventType.ShadowOffsetX:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.ShadowOffsetY:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.BeginPath:
    case CanvasEventType.ClosePath:
      return [type, id] as const;

    case CanvasEventType.MoveTo:
    case CanvasEventType.LineTo:
      return [type, id, await stream.int16(), await stream.int16()] as const;

    case CanvasEventType.BezierCurveTo:
      return [
        type,
        id,
        await stream.int16(),
        await stream.int16(),
        await stream.int16(),
        await stream.int16(),
        await stream.int16(),
        await stream.int16(),
      ] as const;

    case CanvasEventType.QuadraticCurveTo:
      return [
        type,
        id,
        await stream.int16(), // cpx
        await stream.int16(), // cpy
        await stream.int16(), // x
        await stream.int16(), // y
      ];

    case CanvasEventType.Arc:
      return [
        type,
        id,
        await stream.int16(), // x
        await stream.int16(), // y
        await stream.int16(), // radius
        await stream.float32(), // startAngle
        await stream.float32(), // endAngle
        await stream.bool(), // counterclockwise
      ] as const;

    case CanvasEventType.ArcTo:
      return [
        type,
        id,
        await stream.int16(), // x1
        await stream.int16(), // y1
        await stream.int16(), // x2
        await stream.int16(), // y2
        await stream.int16(), // radius
      ] as const;

    case CanvasEventType.Ellipse:
      return [
        type,
        id,
        await stream.int16(), // x
        await stream.int16(), // y
        await stream.int16(), // radiusX
        await stream.int16(), // radiusY
        await stream.float32(), // rotation
        await stream.float32(), // startAngle
        await stream.float32(), // endAngle
        await stream.bool(), // counterclockwise
      ] as const;

    case CanvasEventType.RoundRect: {
      const x = await stream.int16();
      const y = await stream.int16();
      const width = await stream.int16();
      const height = await stream.int16();
      const nRadii = await stream.uint8();
      const radii: number[] = [];
      for (let i = 0; i < nRadii; i++) {
        radii.push(await stream.uint16());
      }
      return [type, id, x, y, width, height, radii] as const;
    }

    case CanvasEventType.Fill:
    case CanvasEventType.Clip:
      return [type, id, fillRule[await stream.uint8()]] as const;

    case CanvasEventType.Stroke:
      return [type, id] as const;

    case CanvasEventType.Rotate:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.Scale:
    case CanvasEventType.Translate:
      return [type, id, await stream.float32(), await stream.float32()] as const;

    case CanvasEventType.Transform:
    case CanvasEventType.SetTransform:
      return [
        type,
        id,
        await stream.float32(),
        await stream.float32(),
        await stream.float32(),
        await stream.float32(),
        await stream.float32(),
        await stream.float32(),
      ] as const;

    case CanvasEventType.ResetTransform:
      return [type, id] as const;

    case CanvasEventType.GlobalAlpha:
      return [type, id, await stream.float32()] as const;

    case CanvasEventType.GlobalCompositeOperation:
      return [type, id, globalCompositeOperation[await stream.uint8()]] as const;

    case CanvasEventType.Save:
    case CanvasEventType.Restore:
    case CanvasEventType.Reset:
      return [type, id] as const;

    case CanvasEventType.Filter:
      return [type, id, await stream.string()] as const;

    case CanvasEventType.CreateImage: {
      const imageId = await stream.uint16();
      const imageType = await stream.string();
      const imageBytes = await stream.bytes();
      return [type, id, imageId, imageType, imageBytes] as const;
    }

    case CanvasEventType.ImageSmoothingEnabled:
      return [type, id, await stream.bool()] as const;

    case CanvasEventType.ImageSmoothingQuality:
      return [type, id, imageSmoothingQuality[await stream.uint8()]] as const;

    case CanvasEventType.DrawImage: {
      const overload = await stream.uint8();
      const imageId = await stream.uint16();
      switch (overload) {
        case 0:
          return [type, id, imageId, await stream.int16(), await stream.int16()] as const;
        case 1:
          return [
            type,
            id,
            imageId,
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
          ] as const;
        case 2:
          return [
            type,
            id,
            imageId,
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
            await stream.int16(),
          ] as const;
      }
    }

    case CanvasEventType.ConnectionClosed:
      return [type, id] as const;

    default:
      throw new Error(`Unknown canvas event type: ${type}`);
  }
}
