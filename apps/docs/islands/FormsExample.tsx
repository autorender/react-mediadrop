import { useEffect, useRef, useState } from "react";
import { useMediaDrop } from "react-mediadrop";
import { Button } from "./shared/Button";
import { Dropzone } from "./shared/Dropzone";
import { FileList } from "./shared/FileList";

export default function FormsExample() {
	const { acceptedFiles, getRootProps, getInputProps } = useMediaDrop();
	const hiddenInputRef = useRef<HTMLInputElement>(null);
	const [submitted, setSubmitted] = useState<string[] | null>(null);

	useEffect(() => {
		if (!hiddenInputRef.current) return;
		const dataTransfer = new DataTransfer();
		for (const item of acceptedFiles) dataTransfer.items.add(item.file);
		hiddenInputRef.current.files = dataTransfer.files;
	}, [acceptedFiles]);

	return (
		<form
			className="w-full space-y-3"
			onSubmit={(event) => {
				event.preventDefault();
				const files = hiddenInputRef.current?.files;
				setSubmitted(files ? Array.from(files).map((file) => file.name) : []);
			}}
		>
			<Dropzone {...getRootProps()}>
				<input {...getInputProps()} />
				<input
					ref={hiddenInputRef}
					type="file"
					name="attachments"
					multiple
					className="hidden"
				/>
				<p>Drag files here, or click to browse</p>
			</Dropzone>
			<FileList files={acceptedFiles} />
			<Button type="submit">Submit</Button>
			{submitted && (
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					Form submitted with:{" "}
					{submitted.length > 0 ? submitted.join(", ") : "no files"}
				</p>
			)}
		</form>
	);
}
