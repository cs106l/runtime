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

    def fill(self, fillRule: str = None):
        if fillRule is None: self.__dispatch("fill", result=False)
        else: self.__dispatch("fill", fillRule, result=False)

    def reset(self):
        self.__dispatch("reset", result=False)
    
    def fillRect(self, x: float, y: float, width: float, height: float):
        self.__dispatch("fillRect", x, y, width, height, result=False)

    def beginPath(self):
        self.__dispatch("beginPath", result=False)

    def moveTo(self, x: float, y: float):
        self.__dispatch("moveTo", x, y, result=False)

    def lineTo(self, x: float, y: float):
        self.__dispatch("lineTo", x, y, result=False)

    def stroke(self):
        self.__dispatch("stroke", result=False)

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

    @classmethod
    def _property(cls, name: str):
        get_name = f"get_{name}"
        set_name = f"set_{name}"

        def getter(self):
            return self.__dispatch(f"get_{name}")
        setattr(cls, get_name, getter)

        def setter(self, value):
            return self.__dispatch(f"set_{name}", value, result=False)
        setattr(cls, set_name, setter)

        # Install the property using those methods
        prop = property(getattr(cls, get_name), getattr(cls, set_name))
        setattr(cls, name, prop)


HTMLCanvas._property("width")
HTMLCanvas._property("height")
HTMLCanvas._property("lineHeight")
HTMLCanvas._property("fillStyle")
HTMLCanvas._property("strokeStyle")
del HTMLCanvas._property