import type { MediaDropFile } from "react-mediadrop";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { FileIcon } from "./FileIcon";

type UploadFileListProps = {
	files: MediaDropFile[];
	renderActions?: (file: MediaDropFile) => ReactNode;
	renderStatus?: (file: MediaDropFile) => ReactNode;
};

export function UploadFileList({
	files,
	renderActions,
	renderStatus,
}: UploadFileListProps) {
	if (files.length === 0) return null;

	return (
		<ul className="m-0 w-full list-none space-y-2 p-0">
			{files.map((file) => {
				const total = file.progress?.total ?? file.size;
				const loaded = file.progress?.loaded ?? 0;

				return (
					<li
						key={file.id}
						className={cn(
							"w-full rounded-md border px-3 py-2 text-sm",
							"border-zinc-200 dark:border-zinc-800",
						)}
					>
						<div className="flex items-center gap-2">
							<FileIcon className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
							<span className="min-w-0 flex-1 truncate text-zinc-900 dark:text-zinc-100">
								{file.name}
							</span>
							<span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
								{file.size.toLocaleString()} bytes
							</span>
							<span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
								{renderStatus?.(file) ?? (file.uploadStatus ?? file.status)}
							</span>
							{renderActions?.(file)}
						</div>
						<progress
							value={loaded}
							max={total}
							className="mt-2 h-1.5 w-full"
						/>
					</li>
				);
			})}
		</ul>
	);
}
