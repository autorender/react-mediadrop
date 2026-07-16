import { useMediaDrop } from "react-mediadrop";

export default function MaxFilesExample() {
	const { acceptedFiles, rejectedFiles, getRootProps, getInputProps } = useMediaDrop({
		restrictions: { maxFiles: 3 },
	});

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
				<em>3 files max — the rest are rejected</em>
			</div>
			<p style={{ fontSize: "0.9rem", color: "var(--blume-muted-foreground)", marginTop: "1rem" }}>
				{acceptedFiles.length} of 3 slots filled
			</p>
			{rejectedFiles.length > 0 && (
				<ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, fontSize: "0.9rem" }}>
					{rejectedFiles.map((file) => (
						<li key={file.id}>{file.name} — {file.errors[0]?.message}</li>
					))}
				</ul>
			)}
		</div>
	);
}
