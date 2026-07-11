import type {
	DragState,
	MediaDropState,
	VanillaMediaDropUpload,
} from "@mediadrop/vanilla";
import { createVanillaMediaDrop } from "@mediadrop/vanilla";
import { MAX_SIZE, TRANSPORTS, type TransportKey } from "./transports.js";
import "./style.css";

const appElement = document.getElementById("app");
if (!appElement) {
	throw new Error("Missing #app element");
}
const app = appElement;

let selected: TransportKey = "xhr";
let uploader: VanillaMediaDropUpload;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** File names and error messages are attacker-influenceable — escape before innerHTML. */
function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function renderShell(): void {
	const activeTransport = TRANSPORTS[selected];

	app.innerHTML = `
		<main class="page">
			<h1>@mediadrop/vanilla demo</h1>
			<p class="subtitle">
				One plain-JS/DOM app, every transport mediadrop ships — switch below
				to re-mount the dropzone against a different <code>UploadTransport</code>.
				Accepts PNG/JPEG/WebP, up to 5 files, 5 MB each. Needs
				<code>../test-server</code> running locally to actually upload anything.
			</p>
			<div class="transport-picker">
				${(Object.keys(TRANSPORTS) as TransportKey[])
					.map(
						(key) =>
							`<button type="button" data-action="select-transport" data-transport-key="${key}" class="transport-tab${key === selected ? " transport-tab--active" : ""}">${TRANSPORTS[key].label}</button>`,
					)
					.join("")}
			</div>
			<p class="transport-description">${activeTransport.description}</p>
			${
				activeTransport.requiresAwsSetup
					? `<p class="hint hint--setup">Needs <code>AWS_S3_BUCKET</code>/<code>AWS_REGION</code> set in <code>test-server/.env</code> — see <code>test-server/README.md</code>.</p>`
					: ""
			}
			<div class="dropzone dropzone--idle" id="dropzone">
				<input type="file" id="file-input" multiple hidden />
				<p>Drag files here, or</p>
				<button type="button" data-action="choose">Choose files</button>
				<p class="hint hint--error" id="reject-hint" hidden>
					Some of these files are not allowed
				</p>
			</div>
			<div class="summary">
				<span id="summary-total">0 total</span>
				<span class="summary__accepted" id="summary-accepted">0 accepted</span>
				<span class="summary__rejected" id="summary-rejected">0 rejected</span>
				<button type="button" data-action="clear-all" id="clear-all">Clear all</button>
				<button type="button" data-action="upload-all" id="upload-all">Upload all</button>
			</div>
			<ul class="file-list" id="file-list"></ul>
		</main>
	`;
}

function renderDragState(state: DragState): void {
	const dropzone = document.getElementById("dropzone") as HTMLDivElement;
	const rejectHint = document.getElementById("reject-hint") as HTMLElement;
	const variant = state.isDragReject
		? "reject"
		: state.isDragAccept
			? "accept"
			: state.isDragActive
				? "active"
				: "idle";
	dropzone.className = `dropzone dropzone--${variant}`;
	rejectHint.hidden = !state.isDragReject;
}

function renderFileItem(item: MediaDropState["files"][number]): string {
	const progressPercent =
		item.progress?.total != null && item.progress.total > 0
			? Math.round((item.progress.loaded / item.progress.total) * 100)
			: null;
	const isPending =
		item.uploadStatus === "uploading" || item.uploadStatus === "queued";

	return `
		<li class="file-item file-item--${item.status}">
			<div class="file-item__meta">
				<span class="file-item__name">${escapeHtml(item.name)}</span>
				<span class="file-item__size">${formatBytes(item.size)}</span>
				<span class="file-item__status">${item.status}</span>
				${
					item.uploadStatus
						? `<span class="file-item__upload-status">upload: ${item.uploadStatus}${
								item.uploadAttempts && item.uploadAttempts > 1
									? ` (attempt ${item.uploadAttempts})`
									: ""
							}</span>`
						: ""
				}
			</div>
			${
				item.errors.length > 0
					? `<ul class="file-item__errors">${item.errors
							.map((error) => `<li>[${error.code}] ${escapeHtml(error.message)}</li>`)
							.join("")}</ul>`
					: ""
			}
			${
				isPending
					? `<progress class="file-item__progress" value="${progressPercent ?? ""}" max="100"></progress>`
					: ""
			}
			${
				item.uploadError
					? `<p class="hint hint--error">[${item.uploadError.code}] ${escapeHtml(item.uploadError.message)}</p>`
					: ""
			}
			<div class="file-item__actions">
				${isPending ? `<button type="button" data-action="cancel" data-id="${item.id}">Cancel</button>` : ""}
				${item.uploadStatus === "error" ? `<button type="button" data-action="retry" data-id="${item.id}">Retry</button>` : ""}
				<button type="button" data-action="remove" data-id="${item.id}">Remove</button>
			</div>
		</li>
	`;
}

function renderFiles(state: MediaDropState): void {
	const accepted = state.files.filter((file) => file.status === "accepted");
	const rejected = state.files.filter((file) => file.status === "rejected");

	(document.getElementById("summary-total") as HTMLElement).textContent =
		`${state.files.length} total`;
	(document.getElementById("summary-accepted") as HTMLElement).textContent =
		`${accepted.length} accepted`;
	(document.getElementById("summary-rejected") as HTMLElement).textContent =
		`${rejected.length} rejected`;
	(document.getElementById("clear-all") as HTMLButtonElement).disabled =
		state.files.length === 0;
	(document.getElementById("upload-all") as HTMLButtonElement).disabled =
		accepted.length === 0;

	(document.getElementById("file-list") as HTMLUListElement).innerHTML =
		state.files.map(renderFileItem).join("");
}

function mount(): void {
	uploader?.destroy();
	renderShell();

	uploader = createVanillaMediaDrop({
		root: document.getElementById("dropzone") as HTMLDivElement,
		input: document.getElementById("file-input") as HTMLInputElement,
		restrictions: {
			accept: ["image/png", "image/jpeg", "image/webp"],
			maxFiles: 5,
			maxSize: MAX_SIZE,
		},
		transport: TRANSPORTS[selected].create(),
		concurrency: 2,
		retries: 2,
		onChange: renderFiles,
		onDragStateChange: renderDragState,
	});

	renderFiles(uploader.getState());
}

// One delegated listener for the whole app — transport tabs, dropzone
// controls, and per-file actions all route through their data-action.
app.addEventListener("click", (event) => {
	const target = (event.target as HTMLElement).closest<HTMLElement>(
		"[data-action]",
	);
	if (!target) return;

	switch (target.dataset.action) {
		case "select-transport":
			selected = target.dataset.transportKey as TransportKey;
			mount();
			break;
		case "choose":
			uploader.open();
			break;
		case "clear-all":
			uploader.clearFiles();
			break;
		case "upload-all":
			uploader.uploadAll();
			break;
		case "cancel":
			uploader.cancelUpload(target.dataset.id as string);
			break;
		case "retry":
			uploader.retryUpload(target.dataset.id as string);
			break;
		case "remove":
			uploader.removeFile(target.dataset.id as string);
			break;
	}
});

mount();
