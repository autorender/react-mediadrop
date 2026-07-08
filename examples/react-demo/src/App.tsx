import type { UploadTransport } from "@mediadrop/core";
import { browserUploadSessionStore } from "@mediadrop/core";
import { useMediaDrop } from "@mediadrop/react";
import { s3MultipartUpload, s3Upload } from "@mediadrop/s3";
import { tusUpload } from "@mediadrop/tus";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";
import { useMemo, useState } from "react";

const MAX_SIZE = 5 * 1024 * 1024;

type TransportKey = "xhr" | "s3-simple" | "s3-multipart" | "tus";

type TransportDef = {
	label: string;
	description: string;
	create: () => UploadTransport;
};

// Every transport below talks to a real local dev-server endpoint (see
// vite.config.ts) — none of this is a production backend, but the
// requests/responses are real, so the transport code runs unmodified.
const TRANSPORTS: Record<TransportKey, TransportDef> = {
	xhr: {
		label: "XHR (generic endpoint)",
		description:
			"@mediadrop/xhr-upload — one request, the whole file. The dev endpoint fails ~1 in 4 uploads on purpose, so you can see retry/error states.",
		create: () => createXhrUploadTransport({ endpoint: "/api/upload" }),
	},
	"s3-simple": {
		label: "S3 (single request)",
		description:
			"@mediadrop/s3's s3Upload — one presigned PUT request, for files small enough that splitting into parts isn't worth it.",
		create: () =>
			s3Upload({
				getUploadUrl: async () => ({ url: "/api/s3-simple", method: "PUT" }),
			}),
	},
	"s3-multipart": {
		label: "S3 (multipart, resumable)",
		description:
			"@mediadrop/s3's s3MultipartUpload — splits the file into parts, uploads them with bounded concurrency, and persists enough metadata (via browserUploadSessionStore) to skip already-uploaded parts if you reselect the same file after a reload.",
		create: () =>
			s3MultipartUpload({
				partSize: 5 * 1024 * 1024,
				sessionStore: browserUploadSessionStore(),
				createMultipartUpload: async ({ file }) => {
					const res = await fetch("/api/s3-multipart/create", {
						method: "POST",
						body: JSON.stringify({ name: file.name }),
					});
					return res.json();
				},
				getPartUploadUrl: async ({ key, uploadId, partNumber }) => ({
					url: `/api/s3-multipart/part?uploadId=${uploadId}&partNumber=${partNumber}&key=${encodeURIComponent(key)}`,
				}),
				completeMultipartUpload: async ({ key, uploadId, parts }) => {
					const res = await fetch("/api/s3-multipart/complete", {
						method: "POST",
						body: JSON.stringify({ uploadId, key, parts }),
					});
					return res.json();
				},
			}),
	},
	tus: {
		label: "tus (resumable chunks)",
		description:
			"@mediadrop/tus's tusUpload — POSTs to create, then PATCHes chunks, against a minimal local tus server (vite.config.ts). Resumes from the server-reported offset if you reselect the same file after a reload.",
		create: () =>
			tusUpload({
				endpoint: "/api/tus",
				sessionStore: browserUploadSessionStore(),
			}),
	},
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Uploader({ transportKey }: { transportKey: TransportKey }) {
	const transport = useMemo(
		() => TRANSPORTS[transportKey].create(),
		[transportKey],
	);

	const {
		getRootProps,
		getInputProps,
		open,
		files,
		acceptedFiles,
		rejectedFiles,
		isDragActive,
		isDragAccept,
		isDragReject,
		removeFile,
		clearFiles,
		uploadAll,
		cancelUpload,
		retryUpload,
	} = useMediaDrop({
		restrictions: {
			accept: ["image/png", "image/jpeg", "image/webp"],
			maxFiles: 5,
			maxSize: MAX_SIZE,
		},
		transport,
		concurrency: 2,
		retries: 2,
	});

	const dropzoneState = isDragReject
		? "reject"
		: isDragAccept
			? "accept"
			: isDragActive
				? "active"
				: "idle";

	return (
		<>
			<div
				{...getRootProps()}
				className={`dropzone dropzone--${dropzoneState}`}
			>
				<input {...getInputProps()} />
				<p>Drag files here, or</p>
				<button
					type="button"
					onClick={(event) => {
						// The root div is also click-to-open now; stop this click from
						// bubbling to it so we don't open the dialog twice.
						event.stopPropagation();
						open();
					}}
				>
					Choose files
				</button>
				{isDragReject ? (
					<p className="hint hint--error">
						Some of these files are not allowed
					</p>
				) : null}
			</div>

			<div className="summary">
				<span>{files.length} total</span>
				<span className="summary__accepted">
					{acceptedFiles.length} accepted
				</span>
				<span className="summary__rejected">
					{rejectedFiles.length} rejected
				</span>
				<button
					type="button"
					onClick={clearFiles}
					disabled={files.length === 0}
				>
					Clear all
				</button>
				<button
					type="button"
					onClick={uploadAll}
					disabled={acceptedFiles.length === 0}
				>
					Upload all
				</button>
			</div>

			<ul className="file-list">
				{files.map((item) => {
					const progressPercent =
						item.progress?.total != null && item.progress.total > 0
							? Math.round((item.progress.loaded / item.progress.total) * 100)
							: null;

					return (
						<li key={item.id} className={`file-item file-item--${item.status}`}>
							<div className="file-item__meta">
								<span className="file-item__name">{item.name}</span>
								<span className="file-item__size">
									{formatBytes(item.size)}
								</span>
								<span className="file-item__status">{item.status}</span>
								{item.uploadStatus ? (
									<span className="file-item__upload-status">
										upload: {item.uploadStatus}
										{item.uploadAttempts && item.uploadAttempts > 1
											? ` (attempt ${item.uploadAttempts})`
											: ""}
									</span>
								) : null}
							</div>

							{item.errors.length > 0 ? (
								<ul className="file-item__errors">
									{item.errors.map((error) => (
										<li key={`${error.code}:${error.message}`}>
											[{error.code}] {error.message}
										</li>
									))}
								</ul>
							) : null}

							{item.uploadStatus === "uploading" ||
							item.uploadStatus === "queued" ? (
								<progress
									className="file-item__progress"
									value={progressPercent ?? undefined}
									max={100}
								/>
							) : null}

							{item.uploadError ? (
								<p className="hint hint--error">
									[{item.uploadError.code}] {item.uploadError.message}
								</p>
							) : null}

							<div className="file-item__actions">
								{item.uploadStatus === "uploading" ||
								item.uploadStatus === "queued" ? (
									<button type="button" onClick={() => cancelUpload(item.id)}>
										Cancel
									</button>
								) : null}
								{item.uploadStatus === "error" ? (
									<button type="button" onClick={() => retryUpload(item.id)}>
										Retry
									</button>
								) : null}
								<button type="button" onClick={() => removeFile(item.id)}>
									Remove
								</button>
							</div>
						</li>
					);
				})}
			</ul>
		</>
	);
}

export function App() {
	const [selected, setSelected] = useState<TransportKey>("xhr");

	return (
		<main className="page">
			<h1>@mediadrop/react demo</h1>
			<p className="subtitle">
				One React app, every transport mediadrop ships — switch below to
				re-mount the dropzone against a different <code>UploadTransport</code>.
				Accepts PNG/JPEG/WebP, up to 5 files, 5 MB each.
			</p>

			<div className="transport-picker">
				{(Object.keys(TRANSPORTS) as TransportKey[]).map((key) => (
					<button
						key={key}
						type="button"
						className={`transport-tab${selected === key ? " transport-tab--active" : ""}`}
						onClick={() => setSelected(key)}
					>
						{TRANSPORTS[key].label}
					</button>
				))}
			</div>
			<p className="transport-description">
				{TRANSPORTS[selected].description}
			</p>

			<Uploader key={selected} transportKey={selected} />
		</main>
	);
}
