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


    @property
    def width(self):
        return self.__dispatch("width")
    

    @width.setter
    def width(self, value: float):
        self.__dispatch("width", value, result=False)


    @property
    def height(self):
        return self.__dispatch("height")
    

    @height.setter
    def height(self, value: float):
        self.__dispatch("height", value, result=False)

    
    def fill_rect(self, x: float, y: float, width: float, height: float):
        self.__dispatch("fillRect", x, y, width, height, result=False)


    def __dispatch(self, action, *args, result: bool = True):
        file = f"/.canvas/{action}"

        req = {}
        if len(args) > 0: req["args"] = args
        req["id"] = self.__id
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