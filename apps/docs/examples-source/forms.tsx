import { useMediaDrop } from "react-mediadrop";
import { useEffect, useRef } from "react";

export function FormsExample() {
  const { acceptedFiles, getRootProps, getInputProps } = useMediaDrop();
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hiddenInputRef.current) return;
    const dataTransfer = new DataTransfer();
    for (const item of acceptedFiles) dataTransfer.items.add(item.file);
    hiddenInputRef.current.files = dataTransfer.files;
  }, [acceptedFiles]);

  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      <div {...getRootProps()} className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
        <input {...getInputProps()} />
        <input ref={hiddenInputRef} type="file" name="attachments" multiple className="hidden" />
        <p>Drag files here, or click to browse</p>
      </div>
      <ul className="space-y-2">
        {acceptedFiles.map((file) => (
          <li key={file.id} className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            {file.name} — {file.size.toLocaleString()} bytes
          </li>
        ))}
      </ul>
      <button type="submit">Submit</button>
    </form>
  );
}
