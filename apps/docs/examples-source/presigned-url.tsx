import { useEffect, useRef, useState } from "react";
import { useMediaDrop } from "react-mediadrop";
import { createXhrUploadTransport } from "react-mediadrop/xhr-upload";

export function PresignedUploadExample() {
	const [urls, setUrls] = useState<Record<string, string>>({});
	const requested = useRef(new Set<string>());

	const transport = createXhrUploadTransport({
		formData: false, // send the raw file body, not multipart/form-data
		endpoint: (file) => urls[file.id],
	});

	const { files, getRootProps, getInputProps, uploadFile } = useMediaDrop({
		transport,
	});

	useEffect(() => {
		for (const file of files) {
			if (
				file.status === "accepted" &&
				file.uploadStatus === undefined &&
				!requested.current.has(file.id)
			) {
				requested.current.add(file.id);
				fetch(`/api/presign?filename=${file.name}`)
					.then((response) => response.json())
					.then(({ url }) => {
						setUrls((previous) => ({ ...previous, [file.id]: url }));
						uploadFile(file.id);
					});
			}
		}
	}, [files, uploadFile]);

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
				{files.map((file) => (
					<li
						key={file.id}
						className="rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="truncate">{file.name}</span>
							<span className="text-xs text-zinc-500">
								{file.uploadStatus ?? file.status}
							</span>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
