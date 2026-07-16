import { useMediaDrop } from "react-mediadrop";

function noSpacesValidator(file: File) {
	if (file.name.includes(" ")) {
		return { code: "validator-error" as const, message: "Filenames can't contain spaces" };
	}
	return null;
}

export default function ValidatorExample() {
	const { acceptedFiles, rejectedFiles, getRootProps, getInputProps } = useMediaDrop({
		validator: noSpacesValidator,
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
				<em>Filenames with spaces are rejected</em>
			</div>
			<ul style={{ listStyle: "none", margin: "1rem 0 0", padding: 0, fontSize: "0.9rem" }}>
				{acceptedFiles.map((file) => (
					<li key={file.id}>✓ {file.name}</li>
				))}
				{rejectedFiles.map((file) => (
					<li key={file.id} style={{ color: "var(--blume-muted-foreground)" }}>
						✗ {file.name} — {file.errors[0]?.message}
					</li>
				))}
			</ul>
		</div>
	);
}
