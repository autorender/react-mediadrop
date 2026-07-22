"use client";

import { useEffect, useMemo } from "react";
import { type UploadTransport, useMediaDrop } from "react-mediadrop";

type AvatarUploaderProps = {
	transport: UploadTransport;
	accept?: string;
	size?: number;
	className?: string;
};

export default function AvatarUploader({
	transport,
	accept = "image/*",
	size = 96,
	className,
}: AvatarUploaderProps) {
	const {
		files,
		acceptedFiles,
		getRootProps,
		getInputProps,
		removeFile,
		uploadFile,
	} = useMediaDrop({
		transport,
		restrictions: { accept, maxFiles: 1 },
	});

	const current = acceptedFiles[0];

	useEffect(() => {
		for (const file of files) {
			if (file.status === "rejected") {
				removeFile(file.id);
			} else if (
				file.status === "accepted" &&
				file.uploadStatus === undefined
			) {
				uploadFile?.(file.id);
			}
		}
	}, [files, removeFile, uploadFile]);

	const previewUrl = useMemo(
		() => (current ? URL.createObjectURL(current.file) : undefined),
		[current],
	);

	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	// `maxFiles: 1` never frees its slot once a file is accepted, so picking
	// a replacement must remove the current file first — before the native
	// file dialog even opens — or the new selection gets rejected as
	// "too many files".
	const replace = () => {
		if (current) removeFile(current.id);
	};

	return (
		<div className={className ?? "inline-flex flex-col items-center gap-2"}>
			<div
				{...getRootProps({ onClick: replace, onDrop: replace })}
				className="relative cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-input transition-colors hover:border-ring"
				style={{ width: size, height: size }}
			>
				<input {...getInputProps()} />
				{previewUrl ? (
					<img
						src={previewUrl}
						alt="Avatar preview"
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
						Upload
					</div>
				)}
				{current?.uploadStatus === "uploading" && (
					<div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs text-foreground">
						{current.progress?.total
							? `${Math.round(
									(current.progress.loaded / current.progress.total) * 100,
								)}%`
							: "Uploading…"}
					</div>
				)}
				{current?.uploadStatus === "error" && (
					<div className="absolute inset-0 flex items-center justify-center bg-destructive/70 text-xs text-destructive-foreground">
						Failed
					</div>
				)}
			</div>
		</div>
	);
}
