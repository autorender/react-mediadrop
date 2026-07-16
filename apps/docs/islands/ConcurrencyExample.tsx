import { useEffect } from "react";
import { useMediaDrop } from "react-mediadrop";
import { createMockTransport } from "./shared/mockTransport";

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
				<p>Drop several files at once</p>
				<em>
					At most {CONCURRENCY} upload in parallel — the rest wait as "queued"
				</em>
			</div>
			<p
				style={{
					fontSize: "0.85rem",
					color: "var(--blume-muted-foreground)",
					margin: "0.75rem 0 0",
				}}
			>
				Uploading now: {uploadingCount} / {CONCURRENCY}
			</p>
			<ul
				style={{
					listStyle: "none",
					margin: "0.5rem 0 0",
					padding: 0,
					display: "flex",
					flexDirection: "column",
					gap: "0.5rem",
					fontSize: "0.9rem",
				}}
			>
				{files.map((file) => {
					const total = file.progress?.total ?? file.size;
					const loaded = file.progress?.loaded ?? 0;
					return (
						<li key={file.id}>
							<div style={{ display: "flex", justifyContent: "space-between" }}>
								<span>{file.name}</span>
								<span style={{ color: "var(--blume-muted-foreground)" }}>
									{file.uploadStatus ?? file.status}
								</span>
							</div>
							<progress
								value={loaded}
								max={total}
								style={{ width: "100%", height: "6px" }}
							/>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
