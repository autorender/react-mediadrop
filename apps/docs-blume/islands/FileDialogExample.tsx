import { useMediaDrop } from "react-mediadrop";

export default function FileDialogExample() {
	const { acceptedFiles, getRootProps, getInputProps, open } = useMediaDrop({
		noClick: true,
		noKeyboard: true,
	});

	return (
		<div
			{...getRootProps()}
			style={{
				border: "2px dashed var(--blume-border)",
				borderRadius: "var(--blume-radius)",
				padding: "2.5rem 1.5rem",
				textAlign: "center",
				color: "var(--blume-muted-foreground)",
			}}
		>
			<input {...getInputProps()} />
			<p>Drag files here — clicking the dropzone itself does nothing</p>
			<button
				type="button"
				onClick={open}
				style={{
					marginTop: "0.75rem",
					padding: "0.5rem 1rem",
					borderRadius: "var(--blume-radius)",
					border: "1px solid var(--blume-border)",
					background: "var(--blume-accent)",
					color: "#fff",
					cursor: "pointer",
				}}
			>
				Choose files
			</button>
			{acceptedFiles.length > 0 && (
				<ul style={{ listStyle: "none", margin: "1rem 0 0", padding: 0, fontSize: "0.9rem" }}>
					{acceptedFiles.map((file) => (
						<li key={file.id}>{file.name}</li>
					))}
				</ul>
			)}
		</div>
	);
}
