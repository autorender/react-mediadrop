import { useMediaDrop } from "react-mediadrop";
import { cn } from "../components/shared/cn";
import { Dropzone } from "../components/shared/Dropzone";
import { FileList } from "../components/shared/FileList";

function Chip({ label, on }: { label: string; on: boolean }) {
	return (
		<span
			className={cn(
				"rounded-md border px-2 py-1 text-xs",
				on
					? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
					: "border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-500",
			)}
		>
			{label}
		</span>
	);
}

export default function StylingExample() {
	const {
		acceptedFiles,
		rejectedFiles,
		getRootProps,
		getInputProps,
		isFocused,
		isDragActive,
		isDragAccept,
		isDragReject,
	} = useMediaDrop({
		restrictions: { accept: ["image/*"] },
	});

	const status = isDragAccept
		? "Accept — green border"
		: isDragReject
			? "Reject — red border"
			: isDragActive
				? "Dragging — sky border"
				: isFocused
					? "Focused — accent border"
					: "Idle — default border";

	return (
		<div className="w-full space-y-3">
			<Dropzone
				{...getRootProps()}
				active={isDragActive && !isDragAccept && !isDragReject}
				accept={isDragAccept}
				reject={isDragReject}
				focused={isFocused && !isDragActive}
			>
				<input {...getInputProps()} />
				<p>Drag an image here, or click to browse</p>
				<p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
					{status}
				</p>
			</Dropzone>

			<div className="flex flex-wrap gap-2">
				<Chip label="isFocused" on={isFocused} />
				<Chip label="isDragActive" on={isDragActive} />
				<Chip label="isDragAccept" on={isDragAccept} />
				<Chip label="isDragReject" on={isDragReject} />
			</div>

			<FileList files={acceptedFiles} />
			<FileList files={rejectedFiles} variant="rejected" />
		</div>
	);
}
