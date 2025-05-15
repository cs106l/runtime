from abc import ABC, abstractmethod
import math
from types import NoneType
from context2d import Context2D
import weakref

_DEFAULT_OUTLINE_WIDTH = 1

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

def _unsupported(function_name):
    raise NotImplementedError(f"{function_name} is not yet supported! It will be supported in a future release of this library!")

class _Shape(ABC):
    x: float                        # The x coordinate of the shape. Shape-specific meaning.
    y: float                        # The y coordinate of the shape. Shape-specific meaning.
    width: float | None             # The width of the shape (in pixels)
    height: float | None            # The height of the shape (in pixels)
    hidden: bool                    # If this shape is hidden
    fill: str | None                # Fill color. If None, shape is not filled  
    outline: str | None             # Outline color. If None, shape is not outlined
    line_width: float | None     # Outline width. If None, outline has default width

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
        self.line_width = outline
        self.width = None
        self.height = None

    def move_to(self, x: float, y: float):
        self.x = x
        self.y = y

    def move(self, dx: float, dy: float):
        self.x += dx
        self.y += dy

    def get_left_x(self) -> float: return self.x
    def get_top_y(self) -> float: return self.y
    
    def draw(self, ctx: Context2D):
        if self.hidden:
            return
        if self.fill: ctx.fill_style = self.fill
        if self.outline:
            ctx.stroke_style = self.outline
            ctx.line_width = self.line_width or _DEFAULT_OUTLINE_WIDTH
        self._draw(ctx)

    @abstractmethod
    def _draw(self, ctx: Context2D):
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


class _Oval(_Shape):

    def __init__(self, x1, y1, x2, y2, fill="black", outline=None, width=None, color=None):
        super().__init__(x1, y1, fill, outline, width, color, "create_oval")
        _param(x2, [float, int], "x2", "create_oval")
        _param(y2, [float, int], "y2", "create_oval")
        self.width = x2 - x1
        self.height = y2 - y1

    def _draw(self, ctx):
        if not self.fill and not self.outline: return
        radius_x = self.width / 2
        radius_y = self.height / 2
        ctx.begin_path()
        ctx.ellipse(self.x + radius_x, self.y + radius_y, radius_x, radius_y, 0, 0, 2 * math.pi)
        if self.fill: ctx.fill()
        if self.outline: ctx.stroke()

class _Text(_Shape):

    font: str
    anchor: str

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

    def _draw(self, ctx):
        if not self.fill and not self.outline: return
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
            elem.draw(self.__ctx)
        self.__ctx.commit()

    def create_rectangle(self, *args, **kwargs) -> str:
        return self._create(_Rectangle(*args, **kwargs))
    
    def create_oval(self, *args, **kwargs) -> str:
        return self._create(_Oval(*args, **kwargs))
    
    def create_text(self, *args, **kwargs) -> str:
        return self._create(_Text(*args, **kwargs))
    
    def create_image(self, *args, **kwargs) -> str:
        _unsupported("create_image")
    
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

    def delete(self, objectId):
        _param(objectId, [str], "objectId", "delete")
        if objectId not in self.__elems: return
        del self.__elems[objectId]

    def set_hidden(self, objectId, hidden):
        _param(objectId, [str], "objectId", "set_hidden")
        _param(hidden, [bool], "hidden", "set_hidden")
        if objectId not in self.__elems: return
        self.__elems[objectId].set_hidden(hidden)

    def _create(self, shape: _Shape) -> str:
        id = f"shape_{Canvas.__next_id}"
        Canvas.__next_id += 1
        self.__elems[id] = shape
        return id
