import * as gif from "./omggif.js";

export type GifReader = gif.GifReader;
export type GifWriter = gif.GifWriter;

export type GifMetadata = {
  width: number;
  height: number;
  frameCount: number;
  loopCount: number;
};

export type GifFrameInfo = {
  x: number;
  y: number;
  width: number;
  height: number;
  has_local_palette: boolean;
  palette_offset: number;
  palette_size: number;
  data_offset: number;
  data_length: number;
  transparent_index: number | null;
  interlaced: boolean;
  delay: number;
  disposal: number;
};
export type GifFrameData = {
  index: number;
  delay: number;
  data: ImageBitmap;
  isPaletteGlobal: boolean;
  palette: Uint32Array;
};

// Reference: https://github.com/deanm/omggif/pull/31/files
export async function* loadFrames(
  gifReader: gif.GifReader,
): AsyncIterable<GifFrameData> {
  const canvas = new OffscreenCanvas(gifReader.width, gifReader.height);
  const ctx = canvas.getContext("2d")!;

  let prevFrameInfo: GifFrameInfo | null = null;
  let prevRestorePoint: GifFrameData | null = null;
  const scratchData = new ImageData(gifReader.width, gifReader.height);

  for (let i = 0; i < gifReader.numFrames(); i++) {
    const frameInfo = gifReader.frameInfo(i) as GifFrameInfo;

    if (prevFrameInfo) {
      switch (prevFrameInfo.disposal) {
        case 0:
        case 1:
          // draw over the existing canvas
          break;
        case 2:
          // restore to background
          ctx.clearRect(
            prevFrameInfo.x,
            prevFrameInfo.y,
            prevFrameInfo.width,
            prevFrameInfo.height,
          );
          break;
        case 3:
          // "Restore to previous" - revert back to most recent frame that was
          // not set to "Restore to previous", or frame 0
          if (!prevRestorePoint) {
            throw new Error("No previous frame to restore");
          }
          ctx.drawImage(prevRestorePoint.data, 0, 0);
          break;
        default:
        // unknown
      }
    }

    const palette = new Uint8ClampedArray(frameInfo.palette_size * 3);
    gifReader.decodeAndBlitFrameRGBA(i, scratchData.data, palette);
    ctx.putImageData(
      scratchData,
      0,
      0,
      frameInfo.x,
      frameInfo.y,
      frameInfo.width,
      frameInfo.height,
    );

    const frameData: GifFrameData = {
      index: i,
      // data:canvas.transferToImageBitmap(),
      data: await createImageBitmap(canvas),
      delay: frameInfo.delay,
      palette: convertPalette(palette),
      isPaletteGlobal: !frameInfo.has_local_palette,
    };

    yield frameData;

    if (prevRestorePoint == null || frameInfo.disposal !== 3) {
      prevRestorePoint = frameData;
    }
    prevFrameInfo = frameInfo;
  }
}

export function beginFile(
  metadata: GifMetadata & {
    palette?: Uint32Array;
  },
): {
  addFrame: (frame: GifFrameData) => void;
  done: () => boolean;
  buffer: () => Uint8Array;
} {
  const { width, height, frameCount } = metadata;
  let framesRemaining = frameCount;
  const buffer = new Uint8Array((width * height + 1024) * frameCount);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  })!;

  const globalOptions: any = {
    loop: metadata.loopCount,
    palette: metadata.palette,
  };

  const gf = new gif.GifWriter(buffer, width, height, globalOptions);

  const addFrame = (frame: GifFrameData) => {
    context.drawImage(frame.data, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = encodeImage(imageData, frame.palette);
    const frameOptions = {
      delay: frame.delay,
      palette: frame.isPaletteGlobal ? undefined : frame.palette,
    };
    gf.addFrame(0, 0, width, height, pixels, frameOptions);
    framesRemaining--;
  };

  return {
    addFrame,
    done: () => framesRemaining === 0,
    buffer: () => buffer.subarray(0, gf.end()),
  };
}

function encodeImage(image: ImageData, palette: Uint32Array): Uint8Array {
  const indexedColors: Record<string, number> = {};
  for (let i = 0; i < palette.length; i++) {
    indexedColors[palette[i]] = i;
  }
  const result = new Uint8Array(image.width * image.height);
  for (let i = 0; i < result.length; i++) {
    const r = image.data[i * 4];
    const g = image.data[i * 4 + 1];
    const b = image.data[i * 4 + 2];
    const color = (r << 16) + (g << 8) + b;
    result[i] = indexedColors[color];
  }
  return result;
}

function convertPalette(palette: Uint8ClampedArray): Uint32Array {
  const result = new Uint32Array(palette.length / 3);
  for (let i = 0; i < result.length; i++) {
    const r = palette[i * 3];
    const g = palette[i * 3 + 1];
    const b = palette[i * 3 + 2];
    result[i] = (r << 16) + (g << 8) + b;
  }
  return result;
}

export async function readFile(
  stream: ReadableStream<Uint8Array>,
  byteLength: number,
): Promise<gif.GifReader> {
  const reader = stream.getReader();
  const data = new Uint8Array(byteLength);
  let pos = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.value) {
      data.set(chunk.value, pos);
      pos += chunk.value.length;
    }
    if (chunk.done) {
      break;
    }
  }
  return new gif.GifReader(data);
}

export function saveFile(data: Uint8Array, name: string) {
  const blob = new Blob([data], { type: "image/gif" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = name;
  link.click();
}
