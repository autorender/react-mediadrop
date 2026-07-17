import { useEffect } from "react";
import { useMediaDrop } from "react-mediadrop";
import { Dropzone } from "./shared/Dropzone";
import { createMockTransport } from "./shared/mockTransport";
import { UploadFileList } from "./shared/UploadFileList";

const CONCURRENCY = 2;

export default function ConcurrencyExample() {
	const { files, getRootProps, getInputProps, uploadFile } = useMediaDrop({
		transport: createMockTransport({ durationMs: 2000 }),
		concurrency: CONCURRENCY,
	});

	useEffect(() => {
		for (const file of files) {
			if (file.status === "accepted" && file.uploadStatus === undefined) {
				uploadFile(file.id);
			}
		}
	}, [files, uploadFile]);

	const uploadingCount = files.filter(
		(file) => file.uploadStatus === "uploading",
	).length;

	return (
		<div className="w-full space-y-3">
			<Dropzone {...getRootProps()}>
				<input {...getInputProps()} />
				<p>Drop several files at once</p>
				<p className="mt-1 text-xs italic">
					At most {CONCURRENCY} upload in parallel — the rest wait as
					&quot;queued&quot;
				</p>
			</Dropzone>
			<p className="text-sm text-zinc-500 dark:text-zinc-400">
				Uploading now: {uploadingCount} / {CONCURRENCY}
			</p>
			<UploadFileList files={files} />
		</div>
	);
}
