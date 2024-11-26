import * as React from "react";
import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import {
  readGifFromFile,
  writeGifToFile,
  GifMetadata,
  GifFrameData,
} from "./gif";
import * as Icons from "./icons";

export type FileEditorProps = {
  sourceFile: File;
};

type FrameState = {
  deleted?: boolean;
};

type Dimension = {
  width: number;
  height: number;
};
type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const ThumbnailMinHeight = 30;
const ThumbnailMaxHeight = 90;
const ScrubberHeight = 4;
const Margin = 20;
const ThumbnailBorder = 4;
const FontSize = 12;
const TextLineHeight = 18;

function getLayout(canvas: Dimension, image: Dimension) {
  const aspectRatio = image.width / image.height;

  const timeline1: Region = {
    x: 0,
    y: canvas.height - ScrubberHeight,
    width: canvas.width,
    height: ScrubberHeight,
  };

  const thumbnailHeight = Math.max(
    ThumbnailMinHeight,
    Math.min(ThumbnailMaxHeight, canvas.height / 3),
  );
  const thumbnailHeightWithLabel =
    thumbnailHeight + ThumbnailBorder + TextLineHeight;

  const timeline2: Region = {
    x: 0,
    y: timeline1.y - thumbnailHeightWithLabel - Margin,
    width: canvas.width,
    height: thumbnailHeightWithLabel,
  };
  const thumbnail: Region = {
    x: canvas.width / 2,
    y: timeline2.y + TextLineHeight,
    width: thumbnailHeight * aspectRatio,
    height: thumbnailHeight,
  };

  const previewAreaHeight = timeline2.y - Margin;
  const previewWidth = Math.round(
    Math.min(image.width, canvas.width, previewAreaHeight * aspectRatio),
  );
  const previewHeight = Math.round(previewWidth / aspectRatio);
  const preview: Region = {
    x: (canvas.width - previewWidth) / 2,
    y: (previewAreaHeight - previewHeight) / 2,
    width: previewWidth,
    height: previewHeight,
  };

  return { preview, timeline1, timeline2, thumbnail };
}

function clearRegion(ctx: CanvasRenderingContext2D, region: Region) {
  const left = Math.max(0, region.x - 1);
  const top = Math.max(0, region.y - 1);
  const right = Math.min(ctx.canvas.width, region.x + region.width + 1);
  const bottom = Math.min(ctx.canvas.height, region.y + region.height + 1);
  ctx.clearRect(left, top, right - left, bottom - top);
}

function PlayControl({
  isPlaying,
  onTogglePlay,
  frames,
  selectedFrame,
  onUpdate,
}: {
  isPlaying: boolean;
  onTogglePlay: (playing: boolean) => void;
  frames?: GifFrameData[];
  selectedFrame: number;
  onUpdate: (frameIndex: number) => void;
}) {
  const timeline = useMemo(
    () =>
      frames?.reduce(
        (arr, f) => {
          arr.push(arr[arr.length - 1] + f.delay * 10);
          return arr;
        },
        [0],
      ) ?? [0],
    [frames],
  );
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (isPlaying && timeline) {
      const start = Date.now();
      requestAnimationFrame(() => {
        const ellapsed = Math.max(Date.now() - start, 1);
        const totalTime = timeline[timeline.length - 1];
        const newTime = (currentTime + ellapsed) % totalTime;
        const frameIndex = lastIndexOf(timeline, (t) => t <= newTime);
        onUpdate(frameIndex);
        setCurrentTime(newTime);
      });
    }
  }, [isPlaying, currentTime, timeline, onUpdate]);

  useEffect(() => {
    if (!isPlaying && timeline) {
      // When playing, this control drives frame update.
      // When not playing, update this control to match updated frames.
      setCurrentTime(timeline[selectedFrame]);
    }
  }, [isPlaying, timeline, selectedFrame]);

  return (
    <div className="play-control">
      <button autoFocus onClick={() => onTogglePlay(!isPlaying)}>
        {isPlaying ? <Icons.Stop /> : <Icons.Play />}
      </button>
      <span>
        {getTimeCode(currentTime)} /{" "}
        {getTimeCode(timeline[timeline.length - 1])}
      </span>
    </div>
  );
}

export function FileEditor({ sourceFile }: FileEditorProps) {
  const [image, setImage] = useState<GifMetadata>();
  const [frames, setFrames] = useState<GifFrameData[]>([]);
  const [frameStates, setFrameStates] = useState<FrameState[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState<"none" | "help" | "info">("none");
  const [dimension, setDimension] = useState<Dimension>({
    width: 1,
    height: 1,
  });
  const [selectedFrame, setSelectedFrame] = useState<number>(0);
  const [scrollPosition, setScrollPosition] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const frameCount = image?.frameCount ?? 0;

  useEffect(() => {
    setFrames([]);
    readGifFromFile(sourceFile, (result) => {
      if (result.type === "metadata") {
        const metadata = result.value;
        setFrameStates(
          loadFileState(sourceFile) ??
            Array.from({ length: metadata.frameCount }, (_) => ({})),
        );
        setSelectedFrame(0);
        setScrollPosition(0);
        setImage(metadata);
      } else {
        setFrames((curr) => curr.concat(result.value));
      }
    });
  }, [sourceFile]);

  useEffect(() => {
    const onResize = () =>
      setDimension({
        width: canvasRef.current?.parentElement?.clientWidth ?? 1,
        height: canvasRef.current?.parentElement?.clientHeight ?? 1,
      });
    window.addEventListener("resize", onResize);
    onResize();
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    if (frameStates.length > 0) {
      saveFileState(sourceFile, frameStates);
    }
  }, [frameStates]);

  // Animation
  const updateFrame = useCallback(
    (i: number) => {
      if (!frameStates[i].deleted) {
        setSelectedFrame(i);
      }
    },
    [frameStates],
  );

  const layout = useMemo(() => {
    if (!image) return null;
    return getLayout(dimension, image);
  }, [dimension, image]);

  const context = useMemo(() => {
    return canvasRef.current?.getContext("2d");
  }, [canvasRef.current]);

  // Reset dimensions
  useEffect(() => {
    if (context) {
      context.canvas.width = dimension.width;
      context.canvas.height = dimension.height;
      context.clearRect(0, 0, dimension.width, dimension.height);
      context.fillStyle = "#000";
      context.font = `${FontSize}px monospace`;
      context.textBaseline = "top";
    }
  }, [context, dimension]);

  // Redraw preview
  useEffect(() => {
    if (context && layout && frames[selectedFrame]) {
      clearRegion(context, layout.preview);
      context.drawImage(
        frames[selectedFrame].data,
        layout.preview.x,
        layout.preview.y,
        layout.preview.width,
        layout.preview.height,
      );
    }
  }, [context, frames[selectedFrame], layout]);

  // Redraw scrubber
  useEffect(() => {
    if (context && layout) {
      clearRegion(context, layout.timeline1);
      const { y, width } = layout.timeline1;
      const unitWidth = (width + 1) / frameCount;

      for (let i = 0; i < frameCount; i++) {
        const x = unitWidth * i;
        context.beginPath();
        context.rect(x, y, unitWidth - 1, ScrubberHeight);
        context.fillStyle =
          selectedFrame === i
            ? "#08f"
            : frameStates[i].deleted
              ? "#ccc"
              : "#444";
        context.fill();
      }
      context.fillStyle = "#000";
    }
  }, [context, layout, selectedFrame, frameStates]);

  // Redraw thumbnails
  useEffect(() => {
    if (context && layout) {
      clearRegion(context, layout.timeline2);
      const { x, y, width, height } = layout.thumbnail;
      const x0 = x - scrollPosition;

      for (let i = frames.length - 1, delay = 0; i >= 0; i--) {
        const frame = frames[i];
        const selected = selectedFrame === i;
        const deleted = frameStates[i].deleted;
        const fx = x0 + i * (width + ThumbnailBorder);
        delay += frame.delay;
        if (fx + width > 0 && fx < dimension.width) {
          context.globalAlpha = deleted ? 0.3 : 1;
          context.drawImage(frame.data, fx, y, width, height);
          context.fillText(
            deleted ? `${frame.index}` : `${frame.index} ${delay / 100}s`,
            fx,
            layout.timeline2.y,
          );
          context.globalAlpha = 1;
          context.beginPath();
          context.rect(fx, y, width, height);
          context.lineWidth = selected ? ThumbnailBorder : 1;
          context.strokeStyle = selected ? "#08f" : "#aaa";
          context.stroke();
        }
        if (!deleted) delay = 0;
      }
    }
  }, [context, frames, layout, selectedFrame, frameStates, scrollPosition]);

  // Handle inputs
  const onScroll = useCallback(
    (evt: React.WheelEvent) => {
      if (layout) {
        const min = 0;
        const max = frameCount * (layout.thumbnail.width + ThumbnailBorder);
        setScrollPosition((p) => Math.max(min, Math.min(max, p + evt.deltaY)));
      }
    },
    [frameCount, layout],
  );

  const onClick = useCallback(
    (evt: React.MouseEvent) => {
      if (layout) {
        const canvasY = canvasRef.current?.offsetTop ?? 0;
        const clientX = evt.clientX;
        const clientY = evt.clientY - canvasY;
        let y = layout.timeline2.y;
        let height = layout.timeline2.height;
        if (clientY >= y && clientY <= y + height) {
          const { x, width } = layout.thumbnail;
          const i = Math.floor(
            (clientX - x + scrollPosition) / (width + ThumbnailBorder),
          );
          if (i >= 0 && i < frameCount) {
            setSelectedFrame(i);
          }
          return;
        }
        y = layout.timeline1.y;
        height = layout.timeline1.height;
        if (clientY >= y && clientY <= y + height) {
          const i = Math.floor((clientX / layout.timeline1.width) * frameCount);
          setSelectedFrame(i);
        }
      }
    },
    [frameCount, layout, scrollPosition],
  );

  const gotoFrame = useCallback(
    (newFrame: number) => {
      if (layout && newFrame >= 0 && newFrame < frameCount) {
        setScrollPosition(
          newFrame * (layout.thumbnail.width + ThumbnailBorder),
        );
        setSelectedFrame(newFrame);
      }
    },
    [frameCount, layout],
  );

  const toggleInfo = useCallback(
    (type: "info" | "help") =>
      setShowInfo((curr) => (curr === type ? "none" : type)),
    [],
  );

  const onKeyDown = useCallback(
    (evt: React.KeyboardEvent) => {
      if (evt.key === " ") {
        setIsPlaying(!isPlaying);
        if (isPlaying) {
          // Bring current frame into view
          gotoFrame(selectedFrame);
        }
      } else if (isPlaying) {
        return;
      } else if (evt.key === "ArrowRight") {
        if (evt.altKey) {
          gotoFrame(
            indexOf(frameStates, (fs) => !fs.deleted, selectedFrame + 1),
          );
        } else {
          gotoFrame(selectedFrame + 1);
        }
      } else if (evt.key === "ArrowLeft") {
        if (evt.altKey) {
          gotoFrame(
            lastIndexOf(frameStates, (fs) => !fs.deleted, selectedFrame - 1),
          );
        } else {
          gotoFrame(selectedFrame - 1);
        }
      } else if (evt.key === "ArrowDown") {
        setFrameStates((curr) => {
          if (curr[selectedFrame].deleted) return curr;
          const newValue = curr.slice();
          newValue[selectedFrame] = { ...curr[selectedFrame], deleted: true };
          return newValue;
        });
        gotoFrame(selectedFrame + 1);
      } else if (evt.key === "ArrowUp") {
        setFrameStates((curr) => {
          if (!curr[selectedFrame].deleted) return curr;
          const newValue = curr.slice();
          newValue[selectedFrame] = { ...curr[selectedFrame], deleted: false };
          return newValue;
        });
        gotoFrame(selectedFrame + 1);
      } else return;

      evt.preventDefault();
    },
    [isPlaying, frameStates, selectedFrame],
  );

  const download = useCallback(() => {
    const framesToSave: GifFrameData[] = [];
    for (let i = 0; i < frameCount; i++) {
      const frame = frames[i];
      if (frameStates[i].deleted) {
        framesToSave[framesToSave.length - 1].delay += frame.delay;
      } else {
        framesToSave.push({ ...frame });
      }
    }
    writeGifToFile(
      { ...image!, frameCount: framesToSave.length },
      framesToSave,
      sourceFile.name,
    );
  }, [frames, frameStates]);

  return (
    <div
      className="editor"
      onWheel={onScroll}
      onClick={isPlaying ? undefined : onClick}
      onKeyDown={onKeyDown}
    >
      <div className="menu">
        <button title="info" onClick={() => toggleInfo("info")}>
          <Icons.Info />
        </button>
        <button
          title="download"
          onClick={download}
          disabled={frames.length !== frameCount}
        >
          <Icons.Download />
        </button>
        <button title="help" onClick={() => toggleInfo("help")}>
          <Icons.Help />
        </button>
      </div>
      <div className="canvas">
        <canvas tabIndex={0} ref={canvasRef} />
      </div>
      <PlayControl
        isPlaying={isPlaying}
        onTogglePlay={setIsPlaying}
        frames={frames}
        selectedFrame={selectedFrame}
        onUpdate={updateFrame}
      />
      {showInfo === "help" && (
        <div className="popup">
          <Help />
        </div>
      )}
      {showInfo === "info" && image && (
        <div className="popup">
          <Info
            image={image}
            frame={frames[selectedFrame]}
            sourceFile={sourceFile}
            frameStates={frameStates}
          />
        </div>
      )}
    </div>
  );
}

function Info({
  sourceFile,
  frame,
  image,
  frameStates,
}: {
  sourceFile: File;
  frame: GifFrameData;
  image: GifMetadata;
  frameStates: FrameState[];
}) {
  const pickedFrames = useMemo(() => {
    return frameStates.reduce((sum, fs) => (fs.deleted ? sum : sum + 1), 0);
  }, [frameStates]);

  return (
    <table cellSpacing={8}>
      <tbody>
        <tr>
          <td>File name</td>
          <td>{sourceFile.name}</td>
        </tr>
        <tr>
          <td>Original size</td>
          <td>{formatFileSize(sourceFile.size)}</td>
        </tr>
        <tr>
          <td>Dimensions</td>
          <td>
            {image.width} x {image.height}
          </td>
        </tr>
        <tr>
          <td>Frames</td>
          <td>{image.frameCount}</td>
        </tr>
        <tr>
          <td>Picked frames</td>
          <td>{pickedFrames}</td>
        </tr>
        <tr>
          <td>Loops</td>
          <td>{image.loopCount || "Forever"}</td>
        </tr>
        <tr>
          <td>Colors</td>
          <td>{frame.palette.length}</td>
        </tr>
      </tbody>
    </table>
  );
}

function Help() {
  return (
    <table cellSpacing={8}>
      <tbody>
        <tr>
          <td>Space</td>
          <td>Play / stop</td>
        </tr>
        <tr>
          <td>Left</td>
          <td>Prev frame</td>
        </tr>
        <tr>
          <td>Right</td>
          <td>Next frame</td>
        </tr>
        <tr>
          <td>Up</td>
          <td>Pick frame</td>
        </tr>
        <tr>
          <td>Down</td>
          <td>Drop frame</td>
        </tr>
        <tr>
          <td>Alt + Left</td>
          <td>Prev picked frame</td>
        </tr>
        <tr>
          <td>Alt + Right</td>
          <td>Next picked frame</td>
        </tr>
      </tbody>
    </table>
  );
}

function loadFileState(file: File): FrameState[] | null {
  const fileKey = `${file.name}_${file.size.toString(16)}`;
  try {
    const value = localStorage.getItem(fileKey);
    if (value) {
      return JSON.parse(value);
    }
  } catch {}
  return null;
}

function saveFileState(file: File, frameStates: FrameState[]) {
  const fileKey = `${file.name}_${file.size.toString(16)}`;
  localStorage.setItem(fileKey, JSON.stringify(frameStates));
}

function indexOf<T>(
  array: T[],
  predicate: (item: T, index: number) => boolean,
  fromIndex?: number,
) {
  for (let i = fromIndex ?? 0; i < array.length; i++) {
    if (predicate(array[i], i)) return i;
  }
  return -1;
}

function lastIndexOf<T>(
  array: T[],
  predicate: (item: T, index: number) => boolean,
  fromIndex?: number,
) {
  for (let i = fromIndex ?? array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i)) return i;
  }
  return -1;
}

function getTimeCode(ms: number) {
  const mm = Math.floor(ms / 1000 / 60);
  const ss = Math.floor(ms / 1000) % 60;
  const ff = Math.floor(ms % 1000);
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}.${ff.toString().padStart(3, "0")}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toPrecision(3)} KB`;
  const mb = kb / 1024;
  return `${mb.toPrecision(3)} MB`;
}
