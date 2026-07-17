import { useEffect, useRef, useState } from "react";
import { useMediaDrop } from "react-mediadrop";
import type { MediaDropFile } from "react-mediadrop";
import { Dropzone } from "./shared/Dropzone";
import {
	CancelIcon,
	IconButton,
	RetryIcon,
} from "./shared/IconButton";
import { createMockTransport } from "./shared/mockTransport";
import { UploadFileList } from "./shared/UploadFileList";

export default function CancelRetryExample() {
	const [forceFail, setForceFail] = useState(true);
	const forceFailRef = useRef(forceFail);
	forceFailRef.current = forceFail;

	const {
		files,
		getRootProps,
		getInputProps,
		uploadFile,
		cancelUpload,
		retryUpload,
	} = useMediaDrop({
		transport: createMockTransport({
			durationMs: 4000,
			shouldFail: () => {
				const shouldFail = forceFailRef.current;
				if (shouldFail) {
					forceFailRef.current = false;
					setForceFail(false);
				}
				return shouldFail;
			},
		}),
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
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={forceFail}
					onChange={(event) => setForceFail(event.target.checked)}
				/>
				Fail the next upload attempt
			</label>
			<Dropzone {...getRootProps()}>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<p className="mt-1 text-xs italic">
					Uploads take 4s — enough time to cancel one mid-flight
				</p>
			</Dropzone>
			<UploadFileList
				files={files}
				renderStatus={(file: MediaDropFile) =>
					file.uploadStatus === "error"
						? `error — ${file.uploadError?.message}`
						: (file.uploadStatus ?? file.status)
				}
				renderActions={(file: MediaDropFile) => (
					<>
						{(file.uploadStatus === "queued" ||
							file.uploadStatus === "uploading") && (
							<IconButton
								aria-label={`Cancel ${file.name}`}
								title="Cancel"
								onClick={() => cancelUpload(file.id)}
							>
								<CancelIcon className="size-4" />
							</IconButton>
						)}
						{file.uploadStatus === "error" && (
							<IconButton
								aria-label={`Retry ${file.name}`}
								title="Retry"
								onClick={() => retryUpload(file.id)}
							>
								<RetryIcon className="size-4" />
							</IconButton>
						)}
					</>
				)}
			/>
		</div>
	);
}
