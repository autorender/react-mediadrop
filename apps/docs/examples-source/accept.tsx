import { useMediaDrop } from "react-mediadrop";

export function AcceptExample() {
	const { acceptedFiles, rejectedFiles, getRootProps, getInputProps } =
		useMediaDrop({ restrictions: { accept: ["image/png", "image/jpeg"] } });

	return (
		<div className="space-y-3">
			<div
				{...getRootProps()}
				className="cursor-pointer rounded-lg border-2 border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700"
			>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
			</div>
			<ul className="space-y-2">
				{acceptedFiles.map((file) => (
					<li
						key={file.id}
						className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
					>
						{file.name} — {file.size.toLocaleString()} bytes
					</li>
				))}
				{rejectedFiles.map((file) => (
					<li
						key={file.id}
						className="rounded-md border border-red-200 px-3 py-2 text-sm dark:border-red-900/60"
					>
						{file.name} — {file.size.toLocaleString()} bytes ·{" "}
						{file.errors.map((e) => e.message).join(", ")}
					</li>
				))}
			</ul>
		</div>
	);
}
