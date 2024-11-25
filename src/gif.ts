import * as gif from "./omggif.js";

export type GifReader = {
  decodeAndBlitFrameRGBA: (
    frameNum: number,
    pixels: Uint8ClampedArray,
    palette?: Uint8ClampedArray,
  ) => void;
  frameInfo: (frameNum: number) => GifFrameInfo;
  width: number;
  height: number;
  numFrames: () => number;
  loopCount: () => number;
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
  disposal: number;
  delay: number;
  data: ImageBitmap;
  paletteGlobal?: Uint32Array;
  paletteLocal?: Uint32Array;
};

// Reference: https://github.com/deanm/omggif/pull/31/files
export async function loadFrames(
  gifReader: GifReader,
): Promise<GifFrameData[]> {
  const canvas = document.createElement("canvas");
  canvas.width = gifReader.width;
  canvas.height = gifReader.height;
  const ctx = canvas.getContext("2d")!;

  let prevFrameInfo: GifFrameInfo | null = null;
  const scratchData = new ImageData(gifReader.width, gifReader.height);

  const result: GifFrameData[] = [];

  for (let i = 0; i < gifReader.numFrames(); i++) {
    const frameInfo = gifReader.frameInfo(i);

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
          const restorePoints = result.filter((frame) => {
            return frame.index === 0 || frame.disposal !== 3;
          });
          ctx.drawImage(restorePoints[restorePoints.length - 1].data, 0, 0);
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

    const data = await createImageBitmap(canvas);

    result[i] = {
      ...frameInfo,
      index: i,
      data,
    };
    if (frameInfo.has_local_palette) {
      result[i].paletteLocal = convertPalette(palette);
    } else {
      result[i].paletteGlobal = convertPalette(palette);
    }
    prevFrameInfo = frameInfo;
  }
  return result;
}

export function saveFrames(frames: GifFrameData[]): Uint8Array {
  const { width, height } = frames[0].data;
  const buffer = new Uint8Array(width * height * frames.length + 1024);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  })!;

  const globalOptions: any = {
    loop: 0,
  };
  const globalPalette = frames.find((f) => f.paletteGlobal)?.paletteGlobal;
  if (globalPalette) {
    globalOptions.palette = globalPalette;
  }

  const gf = new gif.GifWriter(buffer, width, height, globalOptions);
  for (const frame of frames) {
    context.drawImage(frame.data, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    const pixels = encodeImage(
      imageData,
      frame.paletteGlobal || frame.paletteLocal!,
    );
    const frameOptions = {
      delay: frame.delay,
      palette: frame.paletteLocal,
    };
    gf.addFrame(0, 0, width, height, pixels, frameOptions);
  }

  return buffer.slice(0, gf.end());
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

export function readFile(file: File): Promise<GifReader> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      resolve(new gif.GifReader(data));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function saveFile(data: Uint8Array, name: string) {
  const blob = new Blob([data], { type: "image/gif" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = name;
  link.click();
}
