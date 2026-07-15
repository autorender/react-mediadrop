import { useMediaDrop } from "react-mediadrop";
import { useEffect, useRef, useState } from "react";

export default function FormsExample() {
	const { acceptedFiles, getRootProps, getInputProps } = useMediaDrop();
	const hiddenInputRef = useRef<HTMLInputElement>(null);
	const [submitted, setSubmitted] = useState<string[] | null>(null);

	// A dropzone's files live in react-mediadrop's own store, not in a native
	// <input type="file">, so a plain <form> submission won't include them
	// unless we mirror them into a hidden input's FileList ourselves.
	useEffect(() => {
		if (!hiddenInputRef.current) return;
		const dataTransfer = new DataTransfer();
		for (const item of acceptedFiles) dataTransfer.items.add(item.file);
		hiddenInputRef.current.files = dataTransfer.files;
	}, [acceptedFiles]);

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const files = hiddenInputRef.current?.files;
				setSubmitted(files ? Array.from(files).map((file) => file.name) : []);
			}}
		>
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
				<input ref={hiddenInputRef} type="file" name="attachments" multiple style={{ display: "none" }} />
				<p>Drag files here, or click to browse</p>
			</div>
			<button
				type="submit"
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
				Submit
			</button>
			{submitted && (
				<p style={{ fontSize: "0.9rem", color: "var(--blume-muted-foreground)", marginTop: "0.75rem" }}>
					Form submitted with: {submitted.length > 0 ? submitted.join(", ") : "no files"}
				</p>
			)}
		</form>
	);
}
