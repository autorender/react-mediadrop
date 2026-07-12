import type { UploadTransport } from "react-mediadrop";
import { createXhrUploadTransport } from "react-mediadrop/xhr-upload";

export const MAX_SIZE = 5 * 1024 * 1024;

// A real backend — see examples/test-server. Run it separately
// (`pnpm dev` in examples/test-server/) alongside this app.
export const API_BASE =
	import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

export type TransportKey = "xhr";

export type TransportDef = {
	label: string;
	description: string;
	create: () => UploadTransport;
};

export const TRANSPORTS: Record<TransportKey, TransportDef> = {
	xhr: {
		label: "XHR — generic endpoint",
		description:
			"react-mediadrop/xhr-upload — one request, the whole file, written to disk by test-server.",
		create: () =>
			createXhrUploadTransport({
				endpoint: `${API_BASE}/api/upload`,
				formData: false,
			}),
	},
};
