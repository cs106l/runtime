export enum CanvasEventType {

  /* Canvas control */

  /**
   * Creates or reuses a new canvas DOM node with the requested identifier.
   */
  Create = 0,

  /**
   * Removes the canvas with the requested identifier from the DOM.
   * 
   * Encoding:
   *  None
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
  TextBaseline = 18,
  Direction = 19,
  LetterSpacing = 20,
  FontKerning = 21,
  FontStretch = 22,
  FontVariantCaps = 23,
  WordSpacing = 24,

  /* Fill and stroke styles */

  FillStyle = 25,
  StrokeStyle = 26,

  /* Shadows */

  ShadowBlur = 27,
  ShadowColor = 28,
  ShadowOffsetX = 29,
  ShadowOffsetY = 30,

  /* Paths */

  BeginPath = 31,
  ClosePath = 32,
  MoveTo = 33,
  LineTo = 34,
  BezierCurveTo = 35,
  QuadraticCurveTo = 36,
  Arc = 37,
  ArcTo = 38,
  Ellipse = 39,
  Rect = 40,
  RoundRect = 41,

  /* Drawing paths */

  Fill = 42,
  Stroke = 43,
  Clip = 44,

  /* Transformations */

  Rotate = 45,
  Scale = 46,
  Translate = 47,
  Transform = 48,
  SetTransform = 49,
  ResetTransform = 50,

  /* Compositing */

  GlobalAlpha = 51,
  GlobalCompositeOperation = 52,

  /* Canvas State */

  Save = 53,
  Restore = 54,
  Reset = 55,

  /* Filters */

  Filter = 56
}
