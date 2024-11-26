// @ts-ignore Vite query
import GifWriteWorker from "./gif-writer.worker?worker";
import type {
  GifWriteWorkerInputMessage,
  GifWriteWorkerOutputMessage,
} from "./gif-writer.worker";
import { GifFrameData, GifMetadata, saveFile } from "./utils";

export async function writeGifToFile(
  metadata: GifMetadata,
  frames: GifFrameData[],
  fileName: string,
): Promise<void> {
  const worker: Worker = new GifWriteWorker();

  return new Promise(async (resolve) => {
    worker.onmessage = (evt: MessageEvent<GifWriteWorkerOutputMessage>) => {
      const buffer = evt.data.buffer;
      saveFile(buffer, fileName);
      resolve();
    };

    let globalPalette = frames.find((f) => f.isPaletteGlobal)?.palette;
    if (globalPalette) {
      globalPalette = globalPalette.slice();
    }

    worker.postMessage(
      {
        type: "metadata",
        value: { ...metadata, palette: globalPalette },
      } satisfies GifWriteWorkerInputMessage,
      {
        transfer: globalPalette ? [globalPalette.buffer] : [],
      },
    );

    for (const frame of frames) {
      const clonedFrame: GifFrameData = {
        ...frame,
        data: await createImageBitmap(frame.data),
        palette: frame.palette.slice(),
      };

      worker.postMessage(
        {
          type: "frame",
          value: clonedFrame,
        } satisfies GifWriteWorkerInputMessage,
        {
          transfer: [clonedFrame.data, clonedFrame.palette.buffer],
        },
      );
    }
  });
}
