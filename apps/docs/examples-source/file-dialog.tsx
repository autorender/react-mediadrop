import { useMediaDrop } from "react-mediadrop";

export function FileDialogExample() {
  const { acceptedFiles, getRootProps, getInputProps, open } = useMediaDrop({
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div className="space-y-3">
      <div {...getRootProps()} className="rounded-lg border-2 border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
        <input {...getInputProps()} />
        <p>Drag files here — clicking the dropzone itself does nothing</p>
        <button type="button" onClick={open}>Choose files</button>
      </div>
      <ul className="space-y-2">
        {acceptedFiles.map((file) => (
          <li key={file.id} className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            {file.name} — {file.size.toLocaleString()} bytes
          </li>
        ))}
      </ul>
    </div>
  );
}
