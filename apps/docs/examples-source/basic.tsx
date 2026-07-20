import { useMediaDrop } from "react-mediadrop";

export function BasicExample() {
  const { acceptedFiles, getRootProps, getInputProps, isDragActive } =
    useMediaDrop();

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center
          border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400
          ${isDragActive ? "border-sky-500 bg-zinc-100 dark:bg-zinc-900" : ""}`}
      >
        <input {...getInputProps()} />
        <p>Drag files here, or click to browse</p>
      </div>
      {acceptedFiles.length > 0 && (
        <ul className="space-y-2">
          {acceptedFiles.map((file) => (
            <li
              key={file.id}
              className="flex items-start gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="truncate">{file.name}</span>
              <span className="text-xs text-zinc-500">{file.size.toLocaleString()} bytes</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
