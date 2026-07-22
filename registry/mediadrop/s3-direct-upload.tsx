"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type MediaDropFile, useMediaDrop } from "react-mediadrop";
import { createXhrUploadTransport } from "react-mediadrop/xhr-upload";

type S3DirectUploadProps = {
	/** Called once per file to get a presigned PUT URL from your backend. */
	getPresignedUrl?: (file: MediaDropFile) => Promise<string>;
	accept?: string;
	maxFiles?: number;
	className?: string;
};

export default function S3DirectUpload({
	getPresignedUrl,
	accept,
	maxFiles,
	className,
}: S3DirectUploadProps) {
	// Plain mutable object, not a ref: `endpoint` closes over it and mutates
	// it in place (in the effect below) rather than through a ref, so React
	// doesn't treat this as a "read a ref during render" hazard — a plain
	// useState closure here would stay frozen on whatever presigned URLs
	// existed at that first render.
	const urlsMap = useMemo(() => ({}) as Record<string, string>, []);
	const requestedRef = useRef(new Set<string>());
	const [presignErrors, setPresignErrors] = useState<Record<string, string>>(
		{},
	);

	const [transport] = useState(() =>
		createXhrUploadTransport({
			formData: false, // PUT the raw bytes — S3 presigned URLs expect the object body, not multipart/form-data
			endpoint: (file) => urlsMap[file.id] ?? "",
		}),
	);

	const { files, getRootProps, getInputProps, uploadFile, cancelUpload } =
		useMediaDrop({
			transport,
			restrictions: { accept, maxFiles },
		});

	useEffect(() => {
		for (const file of files) {
			if (
				file.status === "accepted" &&
				file.uploadStatus === undefined &&
				!requestedRef.current.has(file.id)
			) {
				if (!getPresignedUrl) continue;
				requestedRef.current.add(file.id);
				getPresignedUrl(file)
					.then((url) => {
						urlsMap[file.id] = url;
						uploadFile(file.id);
					})
					.catch((error) => {
						requestedRef.current.delete(file.id);
						setPresignErrors((previous) => ({
							...previous,
							[file.id]:
								error instanceof Error
									? error.message
									: "Failed to get upload URL",
						}));
					});
			}
		}
	}, [files, getPresignedUrl, uploadFile, urlsMap]);

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
										{presignErrors[file.id] ?? file.uploadStatus ?? file.status}
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
