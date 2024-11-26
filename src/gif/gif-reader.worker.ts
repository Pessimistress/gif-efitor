import { GifMetadata, GifFrameData, readFile, loadFrames } from "./utils";

export type GifReadWorkerInputMessage = {
  size: number;
  stream: ReadableStream<Uint8Array>;
};

export type GifReadWorkerOutputMessage =
  | {
      type: "metadata";
      value: GifMetadata;
    }
  | {
      type: "frame";
      value: GifFrameData;
    };

self.onmessage = async (evt: MessageEvent<GifReadWorkerInputMessage>) => {
  const { size, stream } = evt.data;
  const imageReader = await readFile(stream, size);
  const metadata: GifMetadata = {
    width: imageReader.width,
    height: imageReader.height,
    frameCount: imageReader.numFrames(),
    loopCount: imageReader.loopCount(),
  };
  self.postMessage({
    type: "metadata",
    value: metadata,
  } satisfies GifReadWorkerOutputMessage);

  for await (const frame of loadFrames(imageReader)) {
    self.postMessage(
      {
        type: "frame",
        value: frame,
      } satisfies GifReadWorkerOutputMessage,
      {
        transfer: [frame.data, frame.palette.buffer],
      },
    );
  }
};
