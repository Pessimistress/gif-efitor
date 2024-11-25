import * as React from "react";
import { useDropzone } from "react-dropzone";

export type FileSelectorProps = {
  onAccept: (file: File) => void;
};

const AcceptFileTypes = {
  "image/gif": [".gif"],
} as const;

export function FileSelector({ onAccept }: FileSelectorProps) {
  const { getRootProps, getInputProps, isFocused, isDragAccept, isDragReject } =
    useDropzone({
      accept: AcceptFileTypes,
      multiple: false,
      onDropAccepted: (acceptedFiles) => onAccept(acceptedFiles[0]),
    });

  let className = "dropzone";
  if (isFocused) className += " focus";
  if (isDragAccept) className += " success";
  if (isDragReject) className += " fail";

  return (
    <div className={className} {...getRootProps()}>
      <input {...getInputProps()} />
      <p>Drag and drop a GIF here, or click to browse files</p>
    </div>
  );
}
