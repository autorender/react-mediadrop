import { useEffect } from "react";
import { createHttpError, useMediaDrop, type UploadTransport } from "react-mediadrop";

const transport: UploadTransport = {
  upload(file, { onProgress, signal }) {
    return new Promise((resolve, reject) => {
      const total = file.size;
      const durationMs = 1500;
      const start = performance.now();

      const onAbort = () => {
        clearInterval(interval);
        reject(createHttpError("Aborted"));
      };

      const interval = setInterval(() => {
        const elapsed = performance.now() - start;
        const loaded = Math.min(total, Math.round((elapsed / durationMs) * total));
        onProgress({ loaded, total });

        if (elapsed >= durationMs) {
          clearInterval(interval);
          signal.removeEventListener("abort", onAbort);
          resolve({ response: { simulated: true } });
        }
      }, 100);

      signal.addEventListener("abort", onAbort, { once: true });
    });
  },
};

export function UploadProgressExample() {
  const { files, getRootProps, getInputProps, uploadFile } = useMediaDrop({ transport });

  useEffect(() => {
    for (const file of files) {
      if (file.status === "accepted" && file.uploadStatus === undefined) {
        uploadFile(file.id);
      }
    }
  }, [files, uploadFile]);

  return (
    <div className="space-y-3">
      <div {...getRootProps()} className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
        <input {...getInputProps()} />
        <p>Drag files here, or click to browse</p>
      </div>
      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file.id} className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            <div className="flex justify-between">
              <span>{file.name}</span>
              <span className="text-xs text-zinc-500">{file.size.toLocaleString()} bytes · {file.uploadStatus ?? file.status}</span>
            </div>
            <progress
              className="mt-2 h-1.5 w-full"
              value={file.progress?.loaded ?? 0}
              max={file.progress?.total ?? file.size}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
