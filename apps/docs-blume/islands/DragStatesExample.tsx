import { useMediaDrop } from "react-mediadrop";

function Flag({ label, on }: { label: string; on: boolean }) {
	return (
		<div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
			<span>{label}</span>
			<span style={{ color: on ? "var(--blume-accent)" : "var(--blume-muted-foreground)" }}>
				{String(on)}
			</span>
		</div>
	);
}

export default function DragStatesExample() {
	const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject, isFocused, isDragGlobal } =
		useMediaDrop({ restrictions: { accept: ["image/*"] } });

	return (
		<div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
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
				}}
			>
				<input {...getInputProps()} />
				<p>Drag an image here, or click to browse</p>
			</div>
			<div
				style={{
					border: "1px solid var(--blume-border)",
					borderRadius: "var(--blume-radius)",
					padding: "1rem",
					display: "flex",
					flexDirection: "column",
					gap: "0.4rem",
				}}
			>
				<Flag label="isDragActive" on={isDragActive} />
				<Flag label="isDragAccept" on={isDragAccept} />
				<Flag label="isDragReject" on={isDragReject} />
				<Flag label="isFocused" on={isFocused} />
				<Flag label="isDragGlobal" on={isDragGlobal} />
			</div>
		</div>
	);
}
