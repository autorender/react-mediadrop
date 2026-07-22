"use client";

import { type UploadTransport, useMediaDrop } from "react-mediadrop";

type MultiFileUploadFormProps = {
	transport: UploadTransport;
	accept?: string;
	maxFiles?: number;
	className?: string;
};

export default function MultiFileUploadForm({
	transport,
	accept,
	maxFiles,
	className,
}: MultiFileUploadFormProps) {
	const {
		files,
		acceptedFiles,
		getRootProps,
		getInputProps,
		removeFile,
		uploadFile,
		cancelUpload,
		retryUpload,
	} = useMediaDrop({
		transport,
		restrictions: { accept, maxFiles },
	});

	const pending = acceptedFiles.filter(
		(file) => file.uploadStatus === undefined || file.uploadStatus === "error",
	);

	const handleSubmit = () => {
		for (const file of pending) {
			uploadFile?.(file.id);
		}
	};

	return (
		<div className={className ?? "w-full space-y-3"}>
			<div
				{...getRootProps()}
				className="cursor-pointer rounded-lg border-2 border-dashed border-input px-6 py-10 text-center transition-colors hover:border-ring"
			>
				<input {...getInputProps()} />
				<p className="text-sm text-muted-foreground">
					Drag files here, or click to browse
				</p>
			</div>
			{files.length > 0 && (
				<ul className="space-y-2">
					{files.map((file) => (
						<li
							key={file.id}
							className="rounded-md border border-border px-3 py-2 text-sm"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="truncate">{file.name}</span>
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">
										{file.status === "rejected"
											? (file.errors[0]?.message ?? "Rejected")
											: (file.uploadStatus ?? file.status)}
									</span>
									{file.uploadStatus === "uploading" && (
										<button
											type="button"
											onClick={() => cancelUpload?.(file.id)}
											className="text-xs text-muted-foreground underline hover:text-foreground"
										>
											Cancel
										</button>
									)}
									{file.uploadStatus === "error" && (
										<button
											type="button"
											onClick={() => retryUpload?.(file.id)}
											className="text-xs text-muted-foreground underline hover:text-foreground"
										>
											Retry
										</button>
									)}
									{(file.uploadStatus === undefined ||
										file.uploadStatus === "error" ||
										file.status === "rejected") && (
										<button
											type="button"
											onClick={() => removeFile(file.id)}
											className="text-xs text-muted-foreground underline hover:text-foreground"
										>
											Remove
										</button>
									)}
								</div>
							</div>
							{file.progress?.total != null && (
								<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
									<div
										className="h-full bg-primary transition-all"
										style={{
											width: `${Math.round(
												(file.progress.loaded / file.progress.total) * 100,
											)}%`,
										}}
									/>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
			{pending.length > 0 && (
				<button
					type="button"
					onClick={handleSubmit}
					className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					Upload {pending.length} file{pending.length === 1 ? "" : "s"}
				</button>
			)}
		</div>
	);
}
