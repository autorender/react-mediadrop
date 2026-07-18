import { useEffect } from "react";
import { useMediaDrop } from "react-mediadrop";
import { Dropzone } from "../components/shared/Dropzone";
import { createMockTransport } from "../components/shared/mockTransport";
import { UploadFileList } from "../components/shared/UploadFileList";

export default function UploadProgressExample() {
	const { files, getRootProps, getInputProps, uploadFile } = useMediaDrop({
		transport: createMockTransport({ durationMs: 1500 }),
	});

	useEffect(() => {
		for (const file of files) {
			if (file.status === "accepted" && file.uploadStatus === undefined) {
				uploadFile(file.id);
			}
		}
	}, [files, uploadFile]);

	return (
		<div className="w-full space-y-3">
			<Dropzone {...getRootProps()}>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<p className="mt-1 text-xs italic">
					Each file uploads to a simulated transport as soon as it&apos;s
					accepted
				</p>
			</Dropzone>
			<UploadFileList files={files} />
		</div>
	);
}
