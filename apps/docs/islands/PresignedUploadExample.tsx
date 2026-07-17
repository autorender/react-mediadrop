import { useEffect, useRef, useState } from "react";
import { useMediaDrop } from "react-mediadrop";
import { createMockTransport } from "../components/shared/mockTransport";

// The docs site has no backend to issue real presigned URLs. This stands in
// for "your server returns a presigned PUT URL for this file" — the
// `endpoint` a real createXhrUploadTransport({ formData: false, endpoint })
// would use is resolved the same way: fetched once per file, before that
// file's upload starts.
function fetchPresignedUrl(fileId: string): Promise<string> {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(
				`https://mock-bucket.s3.amazonaws.com/uploads/${fileId}?X-Amz-Signature=...`,
			);
		}, 400);
	});
}

export default function PresignedUploadExample() {
	const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>(
		{},
	);
	const requestedRef = useRef(new Set<string>());

	const { files, getRootProps, getInputProps, uploadFile } = useMediaDrop({
		transport: createMockTransport({ durationMs: 1200 }),
	});

	useEffect(() => {
		for (const file of files) {
			if (
				file.status === "accepted" &&
				file.uploadStatus === undefined &&
				!requestedRef.current.has(file.id)
			) {
				requestedRef.current.add(file.id);
				fetchPresignedUrl(file.id).then((url) => {
					setPresignedUrls((previous) => ({ ...previous, [file.id]: url }));
					uploadFile(file.id);
				});
			}
		}
	}, [files, uploadFile]);

	return (
		<div>
			<div
				{...getRootProps()}
				style={{
					border: "2px dashed var(--blume-border)",
					borderRadius: "var(--blume-radius)",
					padding: "2.5rem 1.5rem",
					textAlign: "center",
					cursor: "pointer",
					color: "var(--blume-muted-foreground)",
				}}
			>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<em>Each file requests its own presigned URL before uploading</em>
			</div>
			<ul
				style={{
					listStyle: "none",
					margin: "1rem 0 0",
					padding: 0,
					display: "flex",
					flexDirection: "column",
					gap: "0.5rem",
					fontSize: "0.9rem",
				}}
			>
				{files.map((file) => {
					const url = presignedUrls[file.id];
					return (
						<li key={file.id}>
							<div style={{ display: "flex", justifyContent: "space-between" }}>
								<span>{file.name}</span>
								<span style={{ color: "var(--blume-muted-foreground)" }}>
									{url ? (file.uploadStatus ?? file.status) : "requesting URL…"}
								</span>
							</div>
							{url && (
								<div
									style={{
										color: "var(--blume-muted-foreground)",
										fontFamily: "monospace",
										fontSize: "0.8rem",
										overflowWrap: "anywhere",
									}}
								>
									{url}
								</div>
							)}
						</li>
					);
				})}
			</ul>
		</div>
	);
}
