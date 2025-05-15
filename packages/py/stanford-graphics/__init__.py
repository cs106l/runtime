from abc import ABC, abstractmethod
from context2d import Context2D

_DEFAULT_OUTLINE_WIDTH = 1

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

    def __init__(self, x1, y1, x2, y2, fill="black", outline=None, width=1, color=None):
        super().__init__(x1, y1)
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
        self.__ctx = Context2D(width=width, height=height)
        self.__elems = {}

    def create_rectangle(self, *args, **kwargs) -> str:
        return self._create(_Rectangle(*args, **kwargs))
    
    def update(self):
        for elem in self.__elems.values():
            elem.draw(self.__ctx)
        self.__ctx.commit()

    def _create(self, shape: _Shape) -> str:
        id = f"shape_{Canvas.__next_id}"
        Canvas.__next_id += 1
        self.__elems[id] = shape
        self.update()
        return id
