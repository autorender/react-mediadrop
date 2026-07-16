import type { MediaDropFile } from "react-mediadrop";
import { cn } from "./cn";
import { FileIcon } from "./FileIcon";

type FileListProps = {
	files: MediaDropFile[];
	variant?: "accepted" | "rejected";
};

export function FileList({ files, variant = "accepted" }: FileListProps) {
	if (files.length === 0) return null;

	return (
		<ul className="m-0 w-full list-none space-y-2 p-0">
			{files.map((file) => (
				<li
					key={file.id}
					className={cn(
						"flex w-full items-start gap-2 rounded-md border px-3 py-2 text-sm",
						variant === "accepted"
							? "border-zinc-200 dark:border-zinc-800"
							: "border-red-200 dark:border-red-900/60",
					)}
				>
					<FileIcon className="mt-0.5 size-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
					<div className="min-w-0 flex-1 text-left">
						<div className="truncate text-zinc-900 dark:text-zinc-100">
							{file.name}
						</div>
						<div className="text-xs text-zinc-500 dark:text-zinc-400">
							{file.size.toLocaleString()} bytes
							{variant === "rejected" && file.errors?.[0] && (
								<> · {file.errors[0].message}</>
							)}
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}
