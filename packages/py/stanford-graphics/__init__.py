from abc import ABC, abstractmethod
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

class _Shape(ABC):
    x: float                        # The x coordinate of the shape. Shape-specific meaning.
    y: float                        # The y coordinate of the shape. Shape-specific meaning.
    width: float | None             # The width of the shape (in pixels)
    height: float | None            # The height of the shape (in pixels)
    hidden: bool                    # If this shape is hidden
    fill: str | None                # Fill color. If None, shape is not filled  
    outline: str | None             # Outline color. If None, shape is not outlined
    line_width: float | None     # Outline width. If None, outline has default width

    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y
        self.hidden = False
        self.fill = "black"
        self.outline = None

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
        if self.outline:
            ctx.line_width = self.line_width or _DEFAULT_OUTLINE_WIDTH
        self._draw(ctx)

    @abstractmethod
    def _draw(self, ctx: Context2D):
        pass


class _Rectangle(_Shape):

    def __init__(self, x1, y1, x2, y2, fill="black", outline=None, width=None, color=None):
        super().__init__(x1, y1)
        _param(x1, [float, int], "x1", "create_rectangle")
        _param(y1, [float, int], "y1", "create_rectangle")
        _param(x2, [float, int], "x2", "create_rectangle")
        _param(y2, [float, int], "y2", "create_rectangle")
        _param(outline, [str, NoneType], "outline", "create_rectangle")
        _param(width, [float, int, NoneType], "width", "create_rectangle")
        _param(color, [str, NoneType], "color", "create_rectangle")
        self.width = x2 - x1
        self.height = y2 - y1
        self.fill = color or fill
        self.outline = outline
        self.line_width = width

    def _draw(self, ctx):
        if self.fill: ctx.fill_rect(self.x, self.y, self.width, self.height)
        if self.outline: ctx.stroke_rect(self.x, self.y, self.width, self.height)

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
    
    def move(self, objectId, dx, dy):
        _param(objectId, [str], "objectId", "move")
        _param(dx, [float, int], "dx", "move")
        _param(dy, [float, int], "dy", "move")
        if objectId not in self.__elems: return
        self.__elems[objectId].move(dx, dy)

    def _create(self, shape: _Shape) -> str:
        id = f"shape_{Canvas.__next_id}"
        Canvas.__next_id += 1
        self.__elems[id] = shape
        return id
