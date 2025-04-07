import json
import struct
import os


class HTMLCanvas:
    __id: str = ""

    def __init__(self):
        os.makedirs("/.canvas", exist_ok=True)
        self.__id = self.__dispatch("new")
        if not self.__id:
            print("[Warning] It looks like you're environment doesn't support canvases!")
            print("          Some operations may not work as intended")

    @staticmethod
    def sleep(ms: float):
        HTMLCanvas.__static_dispatch(None, "sleep", ms, result=False)

    @property
    def width(self): return self.__dispatch("get_width")

    @width.setter
    def width(self, value): self.__dispatch("set_width", value, result=False)

    @property
    def height(self): return self.__dispatch("get_height")

    @height.setter
    def height(self, value): self.__dispatch("set_height", value, result=False)

    @property
    def lineWidth(self): return self.__dispatch("get_lineWidth")

    @lineWidth.setter
    def lineWidth(self, value): self.__dispatch("set_lineWidth", value, result=False)

    @property
    def fillStyle(self): return self.__dispatch("get_fillStyle")

    @fillStyle.setter
    def fillStyle(self, value): self.__dispatch("set_fillStyle", value, result=False)

    @property 
    def strokeStyle(self): return self.__dispatch("get_strokeStyle")

    @strokeStyle.setter
    def strokeStyle(self, value): self.__dispatch("set_strokeStyle", value, result=False)

    @property
    def textAlign(self): return self.__dispatch("get_textAlign")

    @textAlign.setter
    def textAlign(self, value): self.__dispatch("set_textAlign", value, result=False)

    @property
    def textBaseline(self): return self.__dispatch("get_textBaseline")

    @textBaseline.setter
    def textBaseline(self, value): self.__dispatch("set_textBaseline", value, result=False)


    def fill(self, fillRule: str = None):
        if fillRule is None: self.__dispatch("fill", result=False)
        else: self.__dispatch("fill", fillRule, result=False)

    def reset(self):
        self.__dispatch("reset", result=False)
    
    def fillRect(self, x: float, y: float, width: float, height: float):
        self.__dispatch("fillRect", x, y, width, height, result=False)

    def rect(self, x: float, y: float, width: float, height: float):
        self.__dispatch("rect", x, y, width, height, result=False)

    def fillText(self, x: float, y: float, text: str, maxWidth: float = None):
        if maxWidth is None: self.__dispatch("fillText", x, y, text, result=False)
        else: self.__dispatch("fillText", x, y, text, maxWidth, result=False)

    def beginPath(self):
        self.__dispatch("beginPath", result=False)

    def moveTo(self, x: float, y: float):
        self.__dispatch("moveTo", x, y, result=False)

    def lineTo(self, x: float, y: float):
        self.__dispatch("lineTo", x, y, result=False)

    def closePath(self):
        self.__dispatch("closePath", result=False)

    def stroke(self):
        self.__dispatch("stroke", result=False)

    def save(self): self.__dispatch("save", result=False)
    def restore(self): self.__dispatch("restore")
    def commit(self): self.__dispatch("commit", result=False)

    @staticmethod
    def __static_dispatch(id, action, *args, result: bool = True):
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
        return self.__static_dispatch(self.__id, action, *args, result=result)