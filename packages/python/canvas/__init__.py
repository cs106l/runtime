from typing import Literal, Optional

from dataclasses import dataclass
import json
import struct
import os

TextAlign = Literal["left", "right", "center", "start", "end"]
TextBaseline = Literal["top", "hanging", "middle", "alphabetic", "ideographic", "bottom"]
FillRule = Literal["nonzero", "evenodd"]

@dataclass(repr=False) 
class HTMLCanvas:
    __id: str = ""

    # Internal canvas properties
    # HTMLCanvas keeps a copy of the state of the canvas as it exists in the browser
    # As a result, each of these values defaults to the CanvasRenderingContext2D value

    __width: float = 300
    __height: float = 150
    __lineWidth: float = 1
    __fillStyle: str = "black"
    __strokeStyle: str = "black"
    __textAlign: TextAlign = "left"
    __textBaseline: TextBaseline = "top"

    __enabled: bool = True

    def __init__(self):
        os.makedirs("/.canvas", exist_ok=True)
        self.__id = self.__dispatch("new", result=True)
        if not self.__id or type(self.__id) is object:
            # If we get no response or we read back the same object we wrote,
            # then the environment is not picking up our updates!
            # Disable the canvas operations
            self.__enabled = False
            print("[Warning] It looks like you're environment doesn't support canvases!")
            print("          Some operations may not work as intended")

    @staticmethod
    def sleep(ms: float):
        # TODO: This will eventually be folded into time.sleep()
        HTMLCanvas.__static_dispatch(None, "sleep", ms)

    def commit(self):
        """
        Dispatches any updates to the canvas back to the browser.
        This should be called semi-regularly to view any canvas updates,
        although calling it after every update can lead to poor performance.

        Think of this as analogous to flushing stdout!
        """
        self.__dispatch("commit")

    @property
    def width(self): return self.__width

    @width.setter
    def width(self, value: float): 
        self.__width = value
        self.__dispatch("set_width", value)

    @property
    def height(self): return self.__height

    @height.setter
    def height(self, value: float): 
        self.__height = value
        self.__dispatch("set_height", value)

    @property
    def lineWidth(self): return self.__lineWidth

    @lineWidth.setter
    def lineWidth(self, value: float): 
        self.__lineWidth = value
        self.__dispatch("set_lineWidth", value)

    @property
    def fillStyle(self): return self.__fillStyle

    @fillStyle.setter
    def fillStyle(self, value: str): 
        self.__fillStyle = value
        self.__dispatch("set_fillStyle", value)

    @property 
    def strokeStyle(self): return self.__strokeStyle

    @strokeStyle.setter
    def strokeStyle(self, value: str): 
        self.__strokeStyle = value
        self.__dispatch("set_strokeStyle", value)

    @property
    def textAlign(self): return self.__textAlign

    @textAlign.setter
    def textAlign(self, value: TextAlign): 
        self.__textAlign = value
        self.__dispatch("set_textAlign", value)

    @property
    def textBaseline(self): return self.__textBaseline

    @textBaseline.setter
    def textBaseline(self, value: TextBaseline): 
        self.__textBaseline = value
        self.__dispatch("set_textBaseline", value)


    def fill(self, fillRule: Optional[FillRule] = None):
        if fillRule is None: return self.__dispatch("fill")
        self.__dispatch("fill", fillRule)

    def reset(self):
        self.__dispatch("reset")
    
    def fillRect(self, x: float, y: float, width: float, height: float):
        self.__dispatch("fillRect", x, y, width, height)

    def rect(self, x: float, y: float, width: float, height: float):
        self.__dispatch("rect", x, y, width, height)

    def fillText(self, x: float, y: float, text: str, maxWidth: Optional[float] = None):
        if maxWidth is None: self.__dispatch("fillText", x, y, text)
        else: self.__dispatch("fillText", x, y, text, maxWidth)

    def beginPath(self):
        self.__dispatch("beginPath")

    def moveTo(self, x: float, y: float):
        self.__dispatch("moveTo", x, y)

    def lineTo(self, x: float, y: float):
        self.__dispatch("lineTo", x, y)

    def closePath(self):
        self.__dispatch("closePath")

    def stroke(self):
        self.__dispatch("stroke")

    def save(self): self.__dispatch("save")
    def restore(self): self.__dispatch("restore")

    @staticmethod
    def __static_dispatch(id, action, *args, result: bool = False):
        file = f"/.canvas/{action}"

        req = {}
        if len(args) > 0: req["args"] = args
        req["id"] = id
        req_encoded = json.dumps(req).encode()
        req_encoded = struct.pack(">I", len(req_encoded)) + req_encoded

        with open(file, "wb") as f:
            f.write(req_encoded)

        if not result: return

        with open(file, "rb") as f:
            res_length = f.read(4)
            if len(res_length) < 4:
                raise ValueError("Internal: Canvas result expected 32-bit length prefix")
            res_length = struct.unpack(">I", res_length)[0]

            res_encoded = f.read(res_length)
            if len(res_encoded) < res_length:
                raise ValueError(f"Internal: Canvas result expected payload of size {res_length} bytes, got {len(res_encoded)}")

            if not res_encoded:
                return None
          
            res = json.loads(res_encoded.decode())
            return res
        
    def __dispatch(self, action, *args, result: bool = True):
        if not self.__enabled: return None
        return self.__static_dispatch(self.__id, action, *args, result=result)