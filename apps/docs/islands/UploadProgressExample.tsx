import { useEffect } from "react";
import { useMediaDrop } from "react-mediadrop";
import { createMockTransport } from "./shared/mockTransport";

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
				<em>
					Each file uploads to a simulated transport as soon as it's accepted
				</em>
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
