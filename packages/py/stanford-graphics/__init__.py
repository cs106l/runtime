from abc import ABC, abstractmethod
from context2d import Context2D

@ABC
class _Shape:
    __next_tag: int = 0
    __tag: str

    def __init__(self):
        self.__tag = f"shape_{_Shape.__next_id}"
        _Shape.__next_id += 1

    @property
    def tag(self) -> str:
        return self.__tag
    
class _Line(_Shape):
    pass

l = _Line()
print(l.tag)

class Canvas:
    DEFAULT_WIDTH = 500
    """The default width of the canvas is 500."""

    DEFAULT_HEIGHT = 600
    """The default height of the canvas is 600."""

    __ctx: Context2D
    __elems: list[_Shape]

    def __init__(self, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT):
        self.__ctx = Context2D(width=width, height=height)

