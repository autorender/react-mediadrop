import { useMediaDrop } from "react-mediadrop";

export default function BasicExample() {
	const { acceptedFiles, getRootProps, getInputProps, isDragActive } =
		useMediaDrop();

	return (
		<div
			{...getRootProps()}
			style={{
				border: "2px dashed var(--blume-border)",
				borderRadius: "var(--blume-radius)",
				padding: "2.5rem 1.5rem",
				textAlign: "center",
				cursor: "pointer",
				color: "var(--blume-muted-foreground)",
				background: isDragActive ? "var(--blume-muted)" : "transparent",
				borderColor: isDragActive ? "var(--blume-accent)" : "var(--blume-border)",
			}}
		>
			<input {...getInputProps()} />
			<p>Drag files here, or click to browse</p>
			{acceptedFiles.length > 0 && (
				<ul
					style={{
						listStyle: "none",
						margin: "1rem 0 0",
						padding: 0,
						textAlign: "left",
						fontSize: "0.9rem",
						color: "var(--blume-foreground)",
					}}
				>
					{acceptedFiles.map((file) => (
						<li key={file.id}>
							{file.name} — {(file.size / 1024).toFixed(1)} KB
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
