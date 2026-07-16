import { useState } from "react";
import { useMediaDrop } from "react-mediadrop";

export default function EventsExample() {
	const [stopPropagation, setStopPropagation] = useState(false);
	const { acceptedFiles, getRootProps, getInputProps } = useMediaDrop();

	return (
		<div>
			<label
				style={{
					display: "flex",
					gap: "0.5rem",
					alignItems: "center",
					fontSize: "0.9rem",
					marginBottom: "0.75rem",
				}}
			>
				<input
					type="checkbox"
					checked={stopPropagation}
					onChange={(event) => setStopPropagation(event.target.checked)}
				/>
				Call <code>event.stopPropagation()</code> in a custom onDrop
			</label>
			<div
				{...getRootProps({
					onDrop: (event) => {
						if (stopPropagation) event.stopPropagation();
					},
					style: {
						border: "2px dashed var(--blume-border)",
						borderRadius: "var(--blume-radius)",
						padding: "2.5rem 1.5rem",
						textAlign: "center",
						cursor: "pointer",
						color: "var(--blume-muted-foreground)",
					},
				})}
			>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
			</div>
			<p
				style={{
					fontSize: "0.9rem",
					color: "var(--blume-muted-foreground)",
					marginTop: "1rem",
				}}
			>
				{stopPropagation
					? "Stopping propagation yourself skips react-mediadrop's own drop handling — nothing is added below."
					: `${acceptedFiles.length} file(s) accepted`}
			</p>
		</div>
	);
}
