import { useMediaDrop } from "react-mediadrop";

export function StylingExample() {
	const {
		acceptedFiles,
		getRootProps,
		getInputProps,
		isFocused,
		isDragActive,
		isDragAccept,
		isDragReject,
	} = useMediaDrop({ restrictions: { accept: ["image/*"] } });

	const border = isDragAccept
		? "border-green-500"
		: isDragReject
			? "border-red-500"
			: isDragActive
				? "border-sky-500"
				: isFocused
					? "border-sky-600"
					: "border-zinc-300 dark:border-zinc-700";

	return (
		<div className="w-full space-y-3">
			<div
				{...getRootProps()}
				className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center ${border}`}
			>
				<input {...getInputProps()} />
				<p>Drag an image here, or click to browse</p>
			</div>

			<div className="flex flex-wrap gap-2 text-xs">
				<span>isFocused: {String(isFocused)}</span>
				<span>isDragActive: {String(isDragActive)}</span>
				<span>isDragAccept: {String(isDragAccept)}</span>
				<span>isDragReject: {String(isDragReject)}</span>
			</div>

			<ul className="m-0 w-full list-none space-y-2 p-0">
				{acceptedFiles.map((file) => (
					<li key={file.id}>
						{file.name} — {file.size.toLocaleString()} bytes
					</li>
				))}
			</ul>
		</div>
	);
}
