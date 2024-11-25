import * as React from "react";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FileSelector } from "./file-selector";
import { FileEditor } from "./file-editor";

import "./style.css";

function App() {
  const [sourceFile, setSourceFile] = useState<File>();

  if (!sourceFile) {
    return <FileSelector onAccept={setSourceFile} />;
  }

  return <FileEditor sourceFile={sourceFile} />;
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
