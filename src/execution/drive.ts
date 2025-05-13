import { FileDescriptor, WASIDrive, WASIFS } from "@cs106l/wasi";
import { WASISnapshotPreview1 } from "@cs106l/wasi";
import { StreamWriter } from "./stream";
import { CanvasConnection } from "./canvas/host";
import { CanvasEventType } from "./canvas/events";


export class VirtualDrive extends WASIDrive {

  private canvasWriter?: StreamWriter;

  constructor(fs: WASIFS, canvasConnection?: CanvasConnection) {
    super(fs ?? {});
    
    if (canvasConnection) {
      this.canvasWriter = new StreamWriter(canvasConnection.eventBuffer);
    }
  }

  private isCanvasFd(fd: FileDescriptor): boolean {
    const file = this.openMap.get(fd);
    if (!file) return false;
    const path = file.stat().path;
    return path === "/dev/canvas";
  }

  override write(fd: FileDescriptor, data: Uint8Array): WASISnapshotPreview1.Result {

    if (this.isCanvasFd(fd)) {
      if (!this.canvasWriter) return WASISnapshotPreview1.Result.SUCCESS;

      while (data.length > 0) {
        const available = this.canvasWriter.reserve(data.length, true);
        if (!available) continue;
        const writeLength = Math.min(available.data.length, data.length);
        available.data.set(data.subarray(0, writeLength));
        available.commit();
        data = data.subarray(writeLength);
      }

      return WASISnapshotPreview1.Result.SUCCESS;
    }

    return super.write(fd, data);
  }

  disconnect() {
    /** Write EOS message to canvas buffer */
    if (this.canvasWriter) {
      const message = new Uint8Array(6);
      const dv = new DataView(message.buffer);
      dv.setUint32(0, message.length - 4);
      dv.setUint8(4, CanvasEventType.ConnectionClosed);

      let res = this.canvasWriter.reserve(message.length);
      while (!res) {
        res = this.canvasWriter.reserve(message.length);
      }

      res.data.set(message);
      res.commit();
    }
  }
}
