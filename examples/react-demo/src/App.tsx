import { useMediaDrop } from "@mediadrop/react";
import { createXhrUploadTransport } from "@mediadrop/xhr-upload";

const MAX_SIZE = 5 * 1024 * 1024;

// The dev server (see vite.config.ts) serves this locally — it drains the
// request and fails ~1 in 4 uploads on purpose, so this demo's retry/error
// UI has something real to show. It is not a real backend.
const transport = createXhrUploadTransport({ endpoint: "/api/upload" });

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function App() {
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
		<main className="page">
			<h1>@mediadrop/react demo</h1>
			<p className="subtitle">
				Manual test bed for Phase 1 (intake/validation/drag-drop) and Phase 2
				(upload) — accepts PNG/JPEG/WebP, up to 5 files, 5 MB each. Uploads go
				to a local dev-only endpoint (see <code>vite.config.ts</code>) that
				fails ~1 in 4 requests on purpose, so you can see retry/cancel/error
				states without leaving this page.
			</p>

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
		</main>
	);
}
