import { GifFrameData, beginFile, GifMetadata } from "./utils";

export type GifWriteWorkerInputMessage =
  | {
      type: "metadata";
      value: GifMetadata & {
        palette?: Uint32Array;
      };
    }
  | {
      type: "frame";
      value: GifFrameData;
    };

export type GifWriteWorkerOutputMessage = {
  buffer: Uint8Array;
};

let writer: ReturnType<typeof beginFile> | null = null;

self.onmessage = async (evt: MessageEvent<GifWriteWorkerInputMessage>) => {
  console.log(evt.data.type, performance.now());
  if (evt.data.type === "metadata") {
    const metadata = evt.data.value;
    writer = beginFile(metadata);
  } else if (writer) {
    const frame = evt.data.value;
    writer.addFrame(frame);
    // dispose
    frame.data.close();

    if (writer.done()) {
      const buffer = writer.buffer();
      self.postMessage({ buffer } satisfies GifWriteWorkerOutputMessage, {
        transfer: [buffer.buffer],
      });
    }
  }
};
