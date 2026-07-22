"use client";

import { useEffect } from "react";
import { type UploadTransport, useMediaDrop } from "react-mediadrop";

type MediaDropzoneProps = {
	transport: UploadTransport;
	accept?: string;
	maxFiles?: number;
	className?: string;
};

export function MediaDropzone({
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
				uploadFile(file.id);
			}
		}
	}, [files, uploadFile]);

	return (
		<div className={className ?? "w-full space-y-3"}>
			<div
				{...getRootProps()}
				className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 px-6 py-10 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
			>
				<input {...getInputProps()} />
				<p className="text-sm text-zinc-600 dark:text-zinc-400">
					Drag files here, or click to browse
				</p>
			</div>
			{files.length > 0 && (
				<ul className="space-y-2">
					{files.map((file) => (
						<li
							key={file.id}
							className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
						>
							<div className="flex items-center justify-between gap-2">
								<span className="truncate">{file.name}</span>
								<div className="flex items-center gap-2">
									<span className="text-xs text-zinc-500">
										{file.uploadStatus ?? file.status}
									</span>
									{file.uploadStatus === "uploading" && (
										<button
											type="button"
											onClick={() => cancelUpload(file.id)}
											className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
										>
											Cancel
										</button>
									)}
								</div>
							</div>
							{file.progress?.total != null && (
								<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
									<div
										className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
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
