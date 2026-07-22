"use client";

import { useEffect } from "react";
import { type UploadTransport, useMediaDrop } from "react-mediadrop";

type MediaDropzoneProps = {
	transport: UploadTransport;
	accept?: string;
	maxFiles?: number;
	className?: string;
};

export default function MediaDropzone({
	transport,
	accept,
	maxFiles,
	className,
}: MediaDropzoneProps) {
	const { files, getRootProps, getInputProps, uploadFile, cancelUpload } =
		useMediaDrop({
			transport,
			restrictions: { accept, maxFiles },
		});

	useEffect(() => {
		for (const file of files) {
			if (file.status === "accepted" && file.uploadStatus === undefined) {
				uploadFile?.(file.id);
			}
		}
	}, [files, uploadFile]);

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
										{file.uploadStatus ?? file.status}
									</span>
									{file.uploadStatus === "uploading" && (
										<button
											type="button"
											onClick={() => cancelUpload(file.id)}
											className="text-xs text-muted-foreground underline hover:text-foreground"
										>
											Cancel
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
		</div>
	);
}
