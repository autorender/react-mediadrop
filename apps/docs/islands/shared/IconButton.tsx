import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export function IconButton({
	className,
	type = "button",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type={type}
			{...props}
			className={cn(
				"inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
				"border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
				"dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
				"disabled:pointer-events-none disabled:opacity-50",
				className,
			)}
		/>
	);
}

export function CancelIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden
		>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}

export function RetryIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden
		>
			<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
			<path d="M3 3v5h5" />
		</svg>
	);
}
