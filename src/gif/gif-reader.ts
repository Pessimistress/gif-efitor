// @ts-ignore Vite query
import GifReadWorker from "./gif-reader.worker?worker";
import type {
  GifReadWorkerInputMessage,
  GifReadWorkerOutputMessage,
} from "./gif-reader.worker";

export async function readGifFromFile(
  file: File,
  callback: (message: GifReadWorkerOutputMessage) => void,
): Promise<void> {
  const worker: Worker = new GifReadWorker();

  return new Promise((resolve) => {
    let framesRemaining: number | null = null;

    worker.onmessage = (evt: MessageEvent<GifReadWorkerOutputMessage>) => {
      if (evt.data.type === "metadata") {
        framesRemaining = evt.data.value.frameCount;
      } else if (framesRemaining !== null) {
        framesRemaining--;
      }
      callback(evt.data);
      if (framesRemaining === 0) {
        resolve();
      }
    };

    const readStream = file.stream();
    worker.postMessage(
      {
        size: file.size,
        stream: readStream,
      } satisfies GifReadWorkerInputMessage,
      {
        transfer: [readStream],
      },
    );
  });
}
