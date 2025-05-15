from abc import ABC, abstractmethod
import math
from types import NoneType
from context2d import Context2D
import weakref

_DEFAULT_OUTLINE_WIDTH = 1


def _unsupported(function_name):
    raise NotImplementedError(f"{function_name} is not yet supported! It will be supported in a future release of this library!")


def _param(var, var_types, param_name, function_name):
    assert type(var) in var_types, (
        param_name
        + " should be one of the following types: "
        + ", ".join([x.__name__ for x in var_types])
        + " in function "
        + function_name
        + ". Recieved "
        + type(var).__name__
        + " instead."
    )


def _line_aabb_test(x1, y1, x2, y2, X1, Y1, X2, Y2):
    """
    Tests if a line (x1, y1) -> (x2, y2) intersects an axis-aligned bounding box (X1, Y1, X2, Y2)
    """
    xmin, xmax = min(X1, X2), max(X1, X2)
    ymin, ymax = min(Y1, Y2), max(Y1, Y2)

    # Liang-Barsky line clipping algorithm
    dx = x2 - x1
    dy = y2 - y1

    tmin, tmax = 0.0, 1.0

    def clip(p, q):
        nonlocal tmin, tmax
        if p == 0:
            if q < 0:
                return False
            return True
        t = q / p
        if p < 0:
            if t > tmax:
                return False
            if t > tmin:
                tmin = t
        else:
            if t < tmin:
                return False
            if t < tmax:
                tmax = t
        return True

    if not clip(-dx, x1 - xmin):
        return False
    if not clip(dx, xmax - x1):
        return False
    if not clip(-dy, y1 - ymin):
        return False
    if not clip(dy, ymax - y1):
        return False

    return True


class _Shape(ABC):
    x: float                        # The x coordinate of the shape. Shape-specific meaning
    y: float                        # The y coordinate of the shape. Shape-specific meaning
    width: float | None             # The width of the shape (in pixels)
    height: float | None            # The height of the shape (in pixels)
    hidden: bool                    # If this shape is hidden
    fill: str | None                # Fill color. If None, shape is not filled  
    outline: str | None             # Outline color. If None, shape is not outlined
    line_width: float | None        # Outline width. If None, outline has default width

    def __init__(self, x: float, y: float, fill, outline, width, color, function_name: str):
        _param(x, [float, int], "x", function_name)
        _param(y, [float, int], "y", function_name)
        _param(fill, [str, NoneType], "fill", function_name)
        _param(outline, [str, NoneType], "outline", function_name)
        _param(width, [float, int, NoneType], "width", function_name)
        _param(color, [str, NoneType], "color", function_name)
        self.x = x
        self.y = y
        self.hidden = False
        self.fill = color or fill
        self.outline = outline
        self.line_width = width
        self.width = None
        self.height = None

    def move_to(self, x: float, y: float):
        self.x = x
        self.y = y

    def move(self, dx: float, dy: float):
        self.x += dx
        self.y += dy

    def get_left_x(self) -> float | None: return self.x
    def get_top_y(self) -> float | None: return self.y
    def get_x(self) -> float | None: return self.x
    def get_y(self) -> float | None: return self.y
    
    def draw(self, ctx: Context2D):
        if not self.fill and not self.outline: return
        if self.fill: ctx.fill_style = self.fill
        if self.outline:
            ctx.stroke_style = self.outline
            ctx.line_width = self.line_width or _DEFAULT_OUTLINE_WIDTH
        self._draw(ctx)

    @abstractmethod
    def _draw(self, ctx: Context2D):
        pass

    @abstractmethod
    def overlaps(self, x1, y1, x2, y2) -> bool:
        pass


class _Rectangle(_Shape):

    def __init__(self, x1, y1, x2, y2, fill="black", outline=None, width=None, color=None):
        super().__init__(x1, y1, fill, outline, width, color, "create_rectangle")
        _param(x2, [float, int], "x2", "create_rectangle")
        _param(y2, [float, int], "y2", "create_rectangle")
        self.width = x2 - x1
        self.height = y2 - y1

    def _draw(self, ctx):
        if self.fill: ctx.fill_rect(self.x, self.y, self.width, self.height)
        if self.outline: ctx.stroke_rect(self.x, self.y, self.width, self.height)

    def overlaps(self, x1, y1, x2, y2) -> bool:
        return self.x <= x2 and self.x + self.width >= x1 and self.y <= y2 and self.y + self.height >= y1


class _Oval(_Shape):

    def __init__(self, x1, y1, x2, y2, fill="black", outline=None, width=None, color=None):
        super().__init__(x1, y1, fill, outline, width, color, "create_oval")
        _param(x2, [float, int], "x2", "create_oval")
        _param(y2, [float, int], "y2", "create_oval")
        self.width = x2 - x1
        self.height = y2 - y1

    def _draw(self, ctx):
        radius_x = self.width / 2
        radius_y = self.height / 2
        ctx.begin_path()
        ctx.ellipse(self.x + radius_x, self.y + radius_y, radius_x, radius_y, 0, 0, 2 * math.pi)
        if self.fill: ctx.fill()
        if self.outline: ctx.stroke()

    def overlaps(self, x1, y1, x2, y2) -> bool:
        Cx = self.x + self.width / 2
        Cy = self.y + self.height / 2
        rx = self.width / 2
        ry = self.height / 2

        # Clamp point on rect to center of ellipse
        px = max(x1, min(Cx, x2))
        py = max(y1, min(Cy, y2))

        # Normalize and test ellipse inequality
        dx = (px - Cx) / rx
        dy = (py - Cy) / ry

        return dx * dx + dy * dy <= 1


class _Line(_Shape):

    def __init__(self, x1, y1, x2, y2, fill="black", width=1, color=None):
        super().__init__(x1, y1, fill, None, width, color, "create_line")
        _param(x2, [float, int], "x2", "create_line")
        _param(y2, [float, int], "y2", "create_line")
        self.width = x2 - x1
        self.height = y2 - y1

    def _draw(self, ctx):
        ctx.begin_path()
        ctx.move_to(self.x, self.y)
        ctx.line_to(self.x + self.width, self.y + self.height)
        ctx.stroke()

    # Line uses fill for its outline color, so the draw method needs to be customized
    def draw(self, ctx: Context2D):
        if self.hidden: return
        if not self.fill: return
        ctx.stroke_style = self.fill
        ctx.line_width = self.line_width or _DEFAULT_OUTLINE_WIDTH
        self._draw(ctx)

    def overlaps(self, x1, y1, x2, y2) -> bool:
        return _line_aabb_test(self.x, self.y, self.x + self.width, self.y + self.height, x1, y1, x2, y2)
    

class _Text(_Shape):

    font: str
    anchor: str
    text: str

    def __init__(self, x, y, text, font = "Arial", font_size="12", fill="black", anchor = "nw", outline=None, width=None, color=None):
        super().__init__(x, y, fill, outline, width, color, "create_text")
        _param(text, [str], "text", "create_text")
        _param(font, [str], "font", "create_text")
        _param(font_size, [str, int, float], "font_size", "create_text")
        _param(anchor, [str], "anchor", "create_text")
        
        # If font size is not a string, convert it to a string
        if type(font_size) != str:
            font_size = f"{str(font_size)}px"
        font_size = font_size.strip()
        
        # If font size is just a number, add "px" to the end
        # This ensures compatibility with the standalone CS 106A version of this library
        try:
            numeric_font_size = float(font_size)
            font_size = f"{numeric_font_size}px"
        except ValueError:
            pass

        self.font = f"{font_size} {font}"
        self.anchor = anchor
        self.text = text

    def _draw(self, ctx):
        ctx.font = self.font

        if self.anchor == "nw":
            ctx.text_align = "left"
            ctx.text_baseline = "top"
        elif self.anchor == "ne":
            ctx.text_align = "right"
            ctx.text_baseline = "top"
        elif self.anchor == "sw":
            ctx.text_align = "left"
            ctx.text_baseline = "bottom"
        elif self.anchor == "se":
            ctx.text_align = "right"
            ctx.text_baseline = "bottom"
        elif self.anchor == "center":
            ctx.text_align = "center"
            ctx.text_baseline = "middle"
        elif self.anchor == "n":
            ctx.text_align = "center"
            ctx.text_baseline = "top"
        elif self.anchor == "s":
            ctx.text_align = "center"
            ctx.text_baseline = "bottom"
        elif self.anchor == "e":
            ctx.text_align = "right"
            ctx.text_baseline = "middle"
        elif self.anchor == "w":
            ctx.text_align = "left"
            ctx.text_baseline = "middle"
        else:
            ctx.text_align = "start"
            ctx.text_baseline = "top"

        if self.fill: ctx.fill_text(self.text, self.x, self.y)
        if self.outline: ctx.stroke_text(self.text, self.x, self.y)


    def overlaps(self, x1, y1, x2, y2) -> bool:
        return False
    
    # Note: On Code in Place, these methods return None for text objects
    def get_left_x(self) -> float | None: return None
    def get_top_y(self) -> float | None: return None
    def get_x(self) -> float | None: return None
    def get_y(self) -> float | None: return None


class _Polygon(_Shape):

    points: list[tuple[float, float]]

    def __init__(self, *args, fill="black", outline=None, width=None, color=None):
        if len(args) % 2 != 0:
            raise ValueError("Coordinates must be provided in pairs.")
        assert all(isinstance(element, (int, float)) for element in args), "Some coordinates are incorrect types. Accepted types include: int, float."

        ref_x = args[0] if len(args) > 0 else 0
        ref_y = args[1] if len(args) > 1 else 0

        super().__init__(ref_x, ref_y, fill, outline, width, color, "create_polygon")

        self.points = []
        for i in range(0, len(args), 2):
            self.points.append((args[i] - ref_x, args[i + 1] - ref_y))

    def _draw(self, ctx):
        if len(self.points) == 0: return
        ctx.begin_path()
        ctx.move_to(self.points[0][0] + self.x, self.points[0][1] + self.y)
        for i in range(1, len(self.points)):
            ctx.line_to(self.points[i][0] + self.x, self.points[i][1] + self.y)
        ctx.close_path()
        if self.fill: ctx.fill()
        if self.outline: ctx.stroke()

    
    def overlaps(self, x1, y1, x2, y2) -> bool:
        # TODO: Consider implementing this
        # For now, this matches the behaviour of the Code in Place IDE, circa 2025
        return False
    
    # Note: On Code in Place, these methods return None for polygon objects
    def get_left_x(self) -> float | None: return None
    def get_top_y(self) -> float | None: return None
    def get_x(self) -> float | None: return None
    def get_y(self) -> float | None: return None
    

class Canvas:
    DEFAULT_WIDTH = 500
    """The default width of the canvas is 500."""

    DEFAULT_HEIGHT = 600
    """The default height of the canvas is 600."""

    __next_id: int = 0
    __ctx: Context2D
    __elems: dict[str, _Shape]

    def __init__(self, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT):
        _param(width, [float, int], "width", "Canvas")
        _param(height, [float, int], "height", "Canvas")
        self.__ctx = Context2D(width=width, height=height)
        self.__elems = {}

        # This makes sure that the canvas gets rendered when the object is finally deleted
        weakref.finalize(self, self.update)

    def update(self):
        for elem in self.__elems.values():
            if elem.hidden: continue
            elem.draw(self.__ctx)
        self.__ctx.commit()

    def create_rectangle(self, *args, **kwargs) -> str:
        return self._create(_Rectangle(*args, **kwargs))
    
    def create_oval(self, *args, **kwargs) -> str:
        return self._create(_Oval(*args, **kwargs))
    
    def create_line(self, *args, **kwargs) -> str:
        return self._create(_Line(*args, **kwargs))
    
    def create_text(self, *args, **kwargs) -> str:
        return self._create(_Text(*args, **kwargs))
    
    def create_image(self, *args, **kwargs) -> str:
        _unsupported("create_image")

    def create_image_with_size(self, *args, **kwargs) -> str:
        _unsupported("create_image_with_size")
    
    def create_polygon(self, *args, **kwargs) -> str:
        return self._create(_Polygon(*args, **kwargs))
    
    def move(self, objectId, dx, dy):
        _param(objectId, [str], "objectId", "move")
        _param(dx, [float, int], "dx", "move")
        _param(dy, [float, int], "dy", "move")
        if objectId not in self.__elems: return
        self.__elems[objectId].move(dx, dy)

    def moveto(self, objectId, x, y):
        _param(objectId, [str], "objectId", "moveto")
        _param(x, [float, int], "x", "moveto")
        _param(y, [float, int], "y", "moveto")
        if objectId not in self.__elems: return
        self.__elems[objectId].moveto(x, y)

    def move_to(self, objectId, x, y):
        _param(objectId, [str], "objectId", "move_to")
        _param(x, [float, int], "x", "move_to")
        _param(y, [float, int], "y", "move_to")
        self.moveto(objectId, x, y)

    def delete(self, objectId):
        _param(objectId, [str], "objectId", "delete")
        if objectId not in self.__elems: return
        del self.__elems[objectId]

    def set_hidden(self, objectId, hidden):
        _param(objectId, [str], "objectId", "set_hidden")
        _param(hidden, [bool], "hidden", "set_hidden")
        if objectId not in self.__elems: return
        self.__elems[objectId].set_hidden(hidden)

    def change_text(self, objectId, text):
        _param(objectId, [str], "objectId", "change_text")
        _param(text, [str], "text", "change_text")
        if objectId not in self.__elems: return
        elem = self.__elems[objectId]
        if not isinstance(elem, _Text): return
        elem.text = text

    def get_mouse_x(self) -> float:
        _unsupported("get_mouse_x")

    def get_mouse_y(self) -> float:
        _unsupported("get_mouse_y")

    def get_last_click(self):
        _unsupported("get_last_click")

    def get_last_key_press(self):
        _unsupported("get_last_key_press")

    def find_overlapping(self, x1, y1, x2, y2):
        _param(x1, [float, int], "x1", "find_overlapping")
        _param(y1, [float, int], "y1", "find_overlapping")
        _param(x2, [float, int], "x2", "find_overlapping")
        _param(y2, [float, int], "y2", "find_overlapping")
        overlaps = []
        for tag, elem in self.__elems.items():
            if elem.overlaps(x1, y1, x2, y2):
                overlaps.append(tag)
        return overlaps
    
    def clear(self):
        self.__elems.clear()

    def get_left_x(self, objectId) -> float:
        _param(objectId, [str], "objectId", "get_left_x")
        if objectId not in self.__elems: return None
        return self.__elems[objectId].get_left_x()
    
    def get_top_y(self, objectId) -> float:
        _param(objectId, [str], "objectId", "get_top_y")
        if objectId not in self.__elems: return None
        return self.__elems[objectId].get_top_y()
    
    def get_x(self, objectId) -> float:
        _param(objectId, [str], "objectId", "get_x")
        if objectId not in self.__elems: return None
        return self.__elems[objectId].get_x()
    
    def get_y(self, objectId) -> float:
        _param(objectId, [str], "objectId", "get_y")
        if objectId not in self.__elems: return None
        return self.__elems[objectId].get_y()
    
    def get_object_width(self, objectId) -> float:
        _param(objectId, [str], "objectId", "get_object_width")
        if objectId not in self.__elems: return None
        return self.__elems[objectId].width
    
    def get_object_height(self, objectId) -> float:
        _param(objectId, [str], "objectId", "get_object_height")
        if objectId not in self.__elems: return None
        return self.__elems[objectId].height

    def set_color(self, objectId, color):
        _param(objectId, [str], "objectId", "set_color")
        _param(color, [str], "color", "set_color")
        if objectId not in self.__elems: return
        self.__elems[objectId].fill = color

    def set_outline_color(self, objectId, color):
        _param(objectId, [str], "objectId", "set_outline_color")
        _param(color, [str], "color", "set_outline_color")
        if objectId not in self.__elems: return
        self.__elems[objectId].outline = color

    def wait_for_click(self):
        _unsupported("wait_for_click")

    def get_new_mouse_clicks(self):
        _unsupported("get_new_mouse_clicks")

    def get_new_key_presses(self):
        _unsupported("get_new_key_presses")

    def coords(self, objectId):
        _param(objectId, [str], "objectId", "coords")
        return [self.get_x(objectId), self.get_y(objectId)]
        
    def _create(self, shape: _Shape) -> str:
        id = f"shape_{Canvas.__next_id}"
        Canvas.__next_id += 1
        self.__elems[id] = shape
        return id
