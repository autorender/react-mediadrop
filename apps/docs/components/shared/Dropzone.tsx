import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type DropzoneProps = HTMLAttributes<HTMLDivElement> & {
	active?: boolean;
	accept?: boolean;
	reject?: boolean;
	focused?: boolean;
};

export function Dropzone({
	active,
	accept,
	reject,
	focused,
	className,
	children,
	...props
}: DropzoneProps) {
	const idle = !active && !accept && !reject && !focused;

	return (
		<div
			{...props}
			className={cn(
				"w-full cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center",
				"bg-transparent text-zinc-500 dark:text-zinc-400",
				"transition-[border-color,background-color] duration-150",
				idle && "border-zinc-300 dark:border-zinc-700",
				active &&
					"border-sky-500 bg-zinc-100 dark:border-sky-400 dark:bg-zinc-900",
				accept &&
					"border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-950/30",
				reject &&
					"border-red-500 bg-red-50 dark:border-red-400 dark:bg-red-950/30",
				focused && "border-sky-600 dark:border-sky-400",
				className,
			)}
		>
			{children}
		</div>
	);
}
