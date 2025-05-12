from dataclasses import dataclass
from struct import pack
from typing import ClassVar, Optional, TextIO

_TEXT_RENDERING = {
    "auto": 0,
    "optimizeSpeed": 1,
    "optimizeLegibility": 2,
    "geometricPrecision": 3
}

_LINE_CAP = {
    "butt": 0,
    "round": 1,
    "square": 2
}

_LINE_JOIN = {
    "miter": 0,
    "bevel": 1,
    "round": 2
}

_TEXT_ALIGN = {
    "start": 0,
    "end": 1,
    "left": 2,
    "right": 3,
    "center": 4
}

_TEXT_BASELINE = {
    "alphabetic": 0,
    "hanging": 1,
    "top": 2,
    "middle": 3,
    "bottom": 4,
    "ideographic": 5
}

_DIRECTION = {
    "inherit": 0,
    "ltr": 1,
    "rtl": 2
}

_FONT_KERNING = {
    "auto": 0,
    "normal": 1,
    "none": 2
}

_FONT_STRETCH = {
    "normal": 0,
    "ultra-condensed": 1,
    "extra-condensed": 2,
    "condensed": 3,
    "semi-condensed": 4,
    "semi-expanded": 5,
    "expanded": 6,
    "extra-expanded": 7,
    "ultra-expanded": 8
}

_FONT_VARIANT_CAPS = {
    "normal": 0,
    "small-caps": 1,
    "all-small-caps": 2,
    "petite-caps": 3,
    "all-petite-caps": 4,
    "unicase": 5,
    "titling-caps": 6
}

_FILL_RULE = {
    "nonzero": 0,
    "evenodd": 1
}

_GLOBAL_COMPOSITE_OPERATION = {
    "source-over": 0,
    "source-in": 1,
    "source-out": 2,
    "source-atop": 3,
    "destination-over": 4,
    "destination-in": 5,
    "destination-out": 6,
    "destination-atop": 7,
    "lighter": 8,
    "copy": 9,
    "xor": 10,
    "multiply": 11,
    "screen": 12,
    "overlay": 13,
    "darken": 14,
    "lighten": 15,
    "color-dodge": 16,
    "color-burn": 17,
    "hard-light": 18,
    "soft-light": 19,
    "difference": 20,
    "exclusion": 21,
    "hue": 22,
    "saturation": 23,
    "color": 24,
    "luminosity": 25
}

_IMAGE_SMOOTHING_QUALITY = {
    "low": 0,
    "medium": 1,
    "high": 2
}


def _pack_string(string: str):
    return len(string).to_bytes(4) + string.encode()


def _pack_enum(value: str, enum: dict[str, int]):
    if value not in enum:
        raise ValueError(f"Invalid value: {value}. Valid values: {', '.join(enum.keys())}")
    return enum[value].to_bytes(1)


@dataclass
class CanvasGradient:
    __stops: list[tuple[float, str]]

    def add_color_stop(self, offset: float, color: str):
        if offset < 0 or offset > 1:
            raise ValueError(f"Invalid offset: {offset}. Offset must be between 0 and 1")
        self.__stops.append((offset, color))

    def _pack(self) -> bytes:
        return pack("B", len(self.__stops)) + b"".join(pack("f", offset) + _pack_string(color) for offset, color in self.__stops)


@dataclass
class _LinearGradient(CanvasGradient):
    _x0: float
    _y0: float
    _x1: float
    _y1: float

    def _pack(self) -> bytes:
        return super()._pack() + b"\x00" + round(self._x0).to_bytes(2) + round(self._y0).to_bytes(2) + round(self._x1).to_bytes(2) + round(self._y1).to_bytes(2)


@dataclass
class _ConicGradient(CanvasGradient):
    _x: float
    _y: float
    _angle: float

    def _pack(self) -> bytes:
        return super()._pack() + b"\x01" + round(self._x).to_bytes(2) + round(self._y).to_bytes(2) + pack("f", self._angle)
    

@dataclass
class _RadialGradient(CanvasGradient):
    _x0: float
    _y0: float
    _r0: float
    _x1: float
    _y1: float
    _r1: float

    def _pack(self) -> bytes:
        return (super()._pack() + b"\x02" + 
                round(self._x0).to_bytes(2) + 
                round(self._y0).to_bytes(2) + 
                round(self._r0).to_bytes(2) + 
                round(self._x1).to_bytes(2) + 
                round(self._y1).to_bytes(2) + 
                round(self._r1).to_bytes(2))


@dataclass(repr=False)
class Context2D:
    __file: ClassVar[TextIO] = open("/dev/canvas", "wb")
    __next_id: ClassVar[int] = 0

    __id: int = 0

    def __init__(self, *, width: float = 300, height: float = 150):
        self.__id = Context2D.__next_id
        Context2D.__next_id += 1
        if self.__id >= 256:
            raise Exception("Too many Context2D instances! A program can only have 256 Context2D instances at once")
        self.__dispatch(0, round(width).to_bytes(2) + round(height).to_bytes(2))
        self.__width = width
        self.__height = height
    
    def remove(self):
        self.__dispatch(1) # Remove

    __width: float = 300

    @property
    def width(self): return self.__width

    @width.setter
    def width(self, value: float):
        value = round(value)
        if value == self.__width: return
        self.__dispatch(2, value.to_bytes(2))
        self.__width = value

    __height: float = 150

    @property
    def height(self): return self.__height

    @height.setter
    def height(self, value: float):
        value = round(value)
        if value == self.__height: return
        self.__dispatch(3, value.to_bytes(2))
        self.__height = value

    def clear_rect(self, x: float, y: float, width: float, height: float):
        self.__dispatch_rect(4, x, y, width, height)

    def fill_rect(self, x: float, y: float, width: float, height: float):
        self.__dispatch_rect(5, x, y, width, height)

    def stroke_rect(self, x: float, y: float, width: float, height: float):
        self.__dispatch_rect(6, x, y, width, height)

    def fill_text(self, text: str, x: float, y: float, max_width: float = None):
        self.__dispatch_text(7, text, x, y, max_width)

    def stroke_text(self, text: str, x: float, y: float, max_width: float = None):
        self.__dispatch_text(8, text, x, y, max_width)

    __text_rendering: str = "auto"

    @property
    def text_rendering(self): return self.__text_rendering

    @text_rendering.setter
    def text_rendering(self, value: str):
        if value == self.__text_rendering: return
        self.__dispatch(9, _pack_enum(value, _TEXT_RENDERING))
        self.__text_rendering = value

    __line_width: float = 1

    @property
    def line_width(self): return self.__line_width

    @line_width.setter
    def line_width(self, value: float):
        if value == self.__line_width: return
        self.__dispatch(10, pack("f", value))
        self.__line_width = value

    __line_cap: str = "butt"

    @property
    def line_cap(self): return self.__line_cap

    @line_cap.setter
    def line_cap(self, value: str):
        if value == self.__line_cap: return
        self.__dispatch(11, _pack_enum(value, _LINE_CAP))
        self.__line_cap = value

    __line_join: str = "miter"

    @property
    def line_join(self): return self.__line_join

    @line_join.setter
    def line_join(self, value: str):
        if value == self.__line_join: return
        self.__dispatch(12, _pack_enum(value, _LINE_JOIN))
        self.__line_join = value

    __miter_limit: float = 10

    @property
    def miter_limit(self): return self.__miter_limit

    @miter_limit.setter
    def miter_limit(self, value: float):
        if value == self.__miter_limit: return
        self.__dispatch(13, pack("f", value))
        self.__miter_limit = value

    __line_dash: list[int] = []

    def get_line_dash(self): return self.__line_dash[:]

    def set_line_dash(self, dashes: list[int]):
        if dashes == self.__line_dash: return
        self.__dispatch(14, pack("B" * (len(dashes) + 1), len(dashes), *dashes))
        self.__line_dash = dashes

    __line_dash_offset: float = 0
    
    @property
    def line_dash_offset(self): return self.__line_dash_offset

    @line_dash_offset.setter
    def line_dash_offset(self, value: float):
        if value == self.__line_dash_offset: return
        self.__dispatch(15, pack("f", value))
        self.__line_dash_offset = value

    __font: str = "10px sans-serif"

    @property
    def font(self): return self.__font

    @font.setter
    def font(self, value: str):
        if value == self.__font: return
        self.__dispatch(16, _pack_string(value))
        self.__font = value 

    __text_align: str = "start"

    @property
    def text_align(self): return self.__text_align

    @text_align.setter
    def text_align(self, value: str):
        if value == self.__text_align: return
        self.__dispatch(17, _pack_enum(value, _TEXT_ALIGN))
        self.__text_align = value

    __text_baseline: str = "alphabetic"

    @property
    def text_baseline(self): return self.__text_baseline

    @text_baseline.setter
    def text_baseline(self, value: str):
        if value == self.__text_baseline: return
        self.__dispatch(18, _pack_enum(value, _TEXT_BASELINE))
        self.__text_baseline = value

    __direction: str = "inherit"

    @property
    def direction(self): return self.__direction

    @direction.setter
    def direction(self, value: str):
        if value == self.__direction: return
        self.__dispatch(19, _pack_enum(value, _DIRECTION))
        self.__direction = value
    
    __letter_spacing: str = "0px"

    @property
    def letter_spacing(self): return self.__letter_spacing

    @letter_spacing.setter
    def letter_spacing(self, value: float):
        if value == self.__letter_spacing: return
        self.__dispatch(20, _pack_string(value))
        self.__letter_spacing = value

    __font_kerning: str = "auto"

    @property
    def font_kerning(self): return self.__font_kerning

    @font_kerning.setter
    def font_kerning(self, value: str):
        if value == self.__font_kerning: return
        self.__dispatch(21, _pack_enum(value, _FONT_KERNING))
        self.__font_kerning = value

    __font_stretch: str = "normal"

    @property
    def font_stretch(self): return self.__font_stretch

    @font_stretch.setter
    def font_stretch(self, value: str):
        if value == self.__font_stretch: return
        self.__dispatch(22, _pack_enum(value, _FONT_STRETCH))
        self.__font_stretch = value

    __font_variant_caps: str = "normal"

    @property
    def font_variant_caps(self): return self.__font_variant_caps

    @font_variant_caps.setter
    def font_variant_caps(self, value: str):
        if value == self.__font_variant_caps: return
        self.__dispatch(23, _pack_enum(value, _FONT_VARIANT_CAPS))
        self.__font_variant_caps = value

    __word_spacing: str = "0px"

    @property
    def word_spacing(self): return self.__word_spacing

    @word_spacing.setter
    def word_spacing(self, value: str):
        if value == self.__word_spacing: return
        self.__dispatch(24, _pack_string(value))
        self.__word_spacing = value

    
    def create_linear_gradient(self, x0: float, y0: float, x1: float, y1: float):
        return _LinearGradient([], _x0=x0, _y0=y0, _x1=x1, _y1=y1)

    def create_conic_gradient(self, x: float, y: float, angle: float):
        return _ConicGradient([], _x=x, _y=y, _angle=angle)
    
    def create_radial_gradient(self, x0: float, y0: float, r0: float, x1: float, y1: float, r1: float):
        return _RadialGradient([], _x0=x0, _y0=y0, _r0=r0, _x1=x1, _y1=y1, _r1=r1)
    

    __fill_style: CanvasGradient | str = "black"

    @property
    def fill_style(self): return self.__fill_style

    @fill_style.setter
    def fill_style(self, value: CanvasGradient | str):
        if value == self.__fill_style: return
        self.__dispatch_style(25, value)
        self.__fill_style = value


    __stroke_style: CanvasGradient | str = "black"

    @property
    def stroke_style(self): return self.__stroke_style

    @stroke_style.setter
    def stroke_style(self, value: CanvasGradient | str):
        if value == self.__stroke_style: return
        self.__dispatch_style(26, value)
        self.__stroke_style = value

    __shadow_blur: float = 0

    @property
    def shadow_blur(self): return self.__shadow_blur

    @shadow_blur.setter
    def shadow_blur(self, value: float):
        if value == self.__shadow_blur: return
        self.__dispatch(27, pack("f", value))
        self.__shadow_blur = value

    __shadow_color: str = "#00000000"
    
    @property
    def shadow_color(self): return self.__shadow_color

    @shadow_color.setter
    def shadow_color(self, value: str):
        if value == self.__shadow_color: return
        self.__dispatch(28, _pack_string(value))
        self.__shadow_color = value

    __shadow_offset_x: float = 0

    @property
    def shadow_offset_x(self): return self.__shadow_offset_x

    @shadow_offset_x.setter
    def shadow_offset_x(self, value: float):
        if value == self.__shadow_offset_x: return
        self.__dispatch(29, pack("f", value))
        self.__shadow_offset_x = value

    __shadow_offset_y: float = 0

    @property
    def shadow_offset_y(self): return self.__shadow_offset_y

    @shadow_offset_y.setter
    def shadow_offset_y(self, value: float):
        if value == self.__shadow_offset_y: return
        self.__dispatch(30, pack("f", value))
        self.__shadow_offset_y = value

    
    def begin_path(self):
        self.__dispatch(31)

    def close_path(self):
        self.__dispatch(32)

    def move_to(self, x: float, y: float):
        self.__dispatch(33, round(x).to_bytes(2) + round(y).to_bytes(2))

    def line_to(self, x: float, y: float):
        self.__dispatch(34, round(x).to_bytes(2) + round(y).to_bytes(2))

    def bezier_curve_to(self, cp1x: float, cp1y: float, cp2x: float, cp2y: float, x: float, y: float):
        self.__dispatch(35, 
                        round(cp1x).to_bytes(2) + 
                        round(cp1y).to_bytes(2) + 
                        round(cp2x).to_bytes(2) + 
                        round(cp2y).to_bytes(2) + 
                        round(x).to_bytes(2) + 
                        round(y).to_bytes(2))

    def quadratic_curve_to(self, cpx: float, cpy: float, x: float, y: float):
        self.__dispatch(36, round(cpx).to_bytes(2) + round(cpy).to_bytes(2) + round(x).to_bytes(2) + round(y).to_bytes(2))

    def arc(self, x: float, y: float, radius: float, start_angle: float, end_angle: float, counterclockwise: bool = False):
        self.__dispatch(37, 
                        round(x).to_bytes(2) + 
                        round(y).to_bytes(2) + 
                        round(radius).to_bytes(2) + 
                        pack("f", start_angle) + 
                        pack("f", end_angle) + 
                        (b"\x01" if counterclockwise else b"\x00"))
        

    def arc_to(self, x1: float, y1: float, x2: float, y2: float, radius: float):
        self.__dispatch(38, 
                        round(x1).to_bytes(2) + 
                        round(y1).to_bytes(2) + 
                        round(x2).to_bytes(2) + 
                        round(y2).to_bytes(2) + 
                        round(radius).to_bytes(2))
        
    def ellipse(self, x: float, y: float, radius_x: float, radius_y: float, rotation: float, start_angle: float, end_angle: float, counterclockwise: bool = False):
        self.__dispatch(39, 
                        round(x).to_bytes(2) + 
                        round(y).to_bytes(2) + 
                        round(radius_x).to_bytes(2) + 
                        round(radius_y).to_bytes(2) + 
                        pack("f", rotation) + 
                        pack("f", start_angle) + 
                        pack("f", end_angle) + 
                        (b"\x01" if counterclockwise else b"\x00"))
        
    def rect(self, x: float, y: float, width: float, height: float):
        self.__dispatch_rect(40, x, y, width, height)

    def round_rect(self, x: float, y: float, width: float, height: float, radii: float | list[float]):
        if isinstance(radii, float):
            radii = [radii]

        if len(radii) > 4:
            raise ValueError("Too many radii! A round rect can specify at most 4 radii for each corner")

        self.__dispatch(41, 
                        round(x).to_bytes(2) + 
                        round(y).to_bytes(2) + 
                        round(width).to_bytes(2) + 
                        round(height).to_bytes(2) + 
                        len(radii).to_bytes(1) + 
                        b"".join(round(r).to_bytes(2) for r in radii))
        
    def fill(self, fill_rule: str = "nonzero"):
        self.__dispatch(42, _pack_enum(fill_rule, _FILL_RULE))

    def stroke(self):
        self.__dispatch(43)

    def clip(self, fill_rule: str = "nonzero"):
        self.__dispatch(44, _pack_enum(fill_rule, _FILL_RULE))
        
    def rotate(self, angle: float):
        self.__dispatch(45, pack("f", angle))

    def scale(self, x: float, y: float):
        self.__dispatch(47, pack("f", x) + pack("f", y))

    def translate(self, x: float, y: float):
        self.__dispatch(46, round(x).to_bytes(2) + round(y).to_bytes(2))

    def transform(self, m11: float, m12: float, m21: float, m22: float, m31: float, m32: float):
        self.__dispatch_transform(48, m11, m12, m21, m22, m31, m32)

    def set_transform(self, m11: float, m12: float, m21: float, m22: float, m31: float, m32: float):
        self.__dispatch_transform(49, m11, m12, m21, m22, m31, m32)

    def reset_transform(self):
        self.__dispatch(50)

    __global_alpha: float = 1

    @property
    def global_alpha(self): return self.__global_alpha

    @global_alpha.setter
    def global_alpha(self, value: float):
        if value == self.__global_alpha: return
        self.__dispatch(51, pack("f", value))
        self.__global_alpha = value

    __global_composite_operation: str = "source-over"

    @property
    def global_composite_operation(self): return self.__global_composite_operation

    @global_composite_operation.setter
    def global_composite_operation(self, value: str):
        if value == self.__global_composite_operation: return
        self.__dispatch(52, _pack_enum(value, _GLOBAL_COMPOSITE_OPERATION))
        self.__global_composite_operation = value

    def reset(self):
        self.__dispatch(55)

    __filter: str = None

    @property
    def filter(self): return self.__filter

    @filter.setter
    def filter(self, value: str):
        if value == self.__filter: return
        self.__filter = value
        self.__dispatch(56, _pack_string(value))

    __image_smoothing_enabled: bool = True

    @property
    def image_smoothing_enabled(self): return self.__image_smoothing_enabled

    @image_smoothing_enabled.setter
    def image_smoothing_enabled(self, value: bool):
        if value == self.__image_smoothing_enabled: return
        self.__dispatch(59, b"\x01" if value else b"\x00")
        self.__image_smoothing_enabled = value

    __image_smoothing_quality: str = "low"

    @property
    def image_smoothing_quality(self): return self.__image_smoothing_quality

    @image_smoothing_quality.setter
    def image_smoothing_quality(self, value: str):
        if value == self.__image_smoothing_quality: return
        self.__dispatch(60, _pack_enum(value, _IMAGE_SMOOTHING_QUALITY))
        self.__image_smoothing_quality = value

    def __dispatch(self, event_type: int, data: bytes = b""):
        self.__file.write((len(data) + 2).to_bytes(4))
        self.__file.write(event_type.to_bytes(1))
        self.__file.write(self.__id.to_bytes(1))
        self.__file.write(data)


    def __dispatch_rect(self, event_type: int, x: float, y: float, width: float, height: float):
        self.__dispatch(event_type, 
            round(x).to_bytes(2) + 
            round(y).to_bytes(2) + 
            round(width).to_bytes(2) + 
            round(height).to_bytes(2))
    

    def __dispatch_text(self, event_type: int, text: str, x: float, y: float, max_width: Optional[float] = None):
        data = (b"\x00" if max_width is None else b"\x01") + _pack_string(text) + round(x).to_bytes(2) + round(y).to_bytes(2)
        if max_width is not None:
            data += round(max_width).to_bytes(2)
        self.__dispatch(event_type, data)


    def __dispatch_style(self, event_type: int, value: CanvasGradient | str):
        if isinstance(value, str):
            data = b"\x00" + _pack_string(value)
        else:
            data = b"\x01" + value._pack()
        self.__dispatch(event_type, data)

    def __dispatch_transform(self, event_type: int, m11: float, m12: float, m21: float, m22: float, m31: float, m32: float):
        self.__dispatch(event_type, 
                        pack("f", m11) + 
                        pack("f", m12) + 
                        pack("f", m21) + 
                        pack("f", m22) + 
                        pack("f", m31) + 
                        pack("f", m32))