import { useState } from "react";
import sdk from "@stackblitz/sdk";
import { buildStackblitzFiles } from "../examples-source/stackblitz-project";

interface ExampleCodeHeaderProps {
  code: string;
  title: string;
  description?: string;
}

export default function ExampleCodeHeader({
  code,
  title,
  description = "Live example from the react-mediadrop docs.",
}: ExampleCodeHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpen = () => {
    sdk.openProject(
      {
        title,
        description,
        template: "node",
        files: buildStackblitzFiles(code),
      },
      { newWindow: true, openFile: "src/App.tsx" },
    );
  };

  return (
    <div
      data-example-header=""
      className="not-prose flex h-11 items-center justify-between rounded-t-[var(--blume-radius)] border border-b-0 border-[var(--blume-border)] bg-[var(--blume-code-background)] px-4"
    >
      <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        TSX
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
          Open in StackBlitz
        </button>
      </div>
    </div>
  );
}
