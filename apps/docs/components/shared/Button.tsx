import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export function Button({
	className,
	type = "button",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type={type}
			{...props}
			className={cn(
				"inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors",
				"bg-zinc-900 text-zinc-50 hover:bg-zinc-800",
				"dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200",
				"disabled:pointer-events-none disabled:opacity-50",
				className,
			)}
		/>
	);
}
