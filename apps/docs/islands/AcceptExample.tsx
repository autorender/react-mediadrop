import { useMediaDrop } from "react-mediadrop";

export default function AcceptExample() {
	const { acceptedFiles, rejectedFiles, getRootProps, getInputProps, isDragAccept, isDragReject } =
		useMediaDrop({ restrictions: { accept: ["image/png", "image/jpeg"] } });

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
					borderColor: isDragAccept
						? "var(--blume-accent)"
						: isDragReject
							? "#e5484d"
							: "var(--blume-border)",
				}}
			>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<em>Only PNG and JPEG images are accepted</em>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
				<div>
					<strong style={{ fontSize: "0.85rem" }}>Accepted</strong>
					<ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, fontSize: "0.9rem" }}>
						{acceptedFiles.map((file) => (
							<li key={file.id}>{file.name}</li>
						))}
					</ul>
				</div>
				<div>
					<strong style={{ fontSize: "0.85rem" }}>Rejected</strong>
					<ul style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0, fontSize: "0.9rem" }}>
						{rejectedFiles.map((file) => (
							<li key={file.id}>
								{file.name}
								<br />
								<span style={{ color: "var(--blume-muted-foreground)" }}>
									{file.errors.map((error) => error.message).join(", ")}
								</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}
