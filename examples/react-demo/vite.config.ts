import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * A local-only, dev-server-only `/api/upload` endpoint so this demo can
 * exercise `@mediadrop/xhr-upload` for real, without needing an external
 * service or an invented production URL. It drains the request and
 * responds with a small JSON body — it does not read or persist the
 * uploaded file. It fails roughly 1 in 4 requests on purpose, so the
 * demo's retry/error UI has something real to show without you having to
 * simulate a network failure yourself.
 */
function devUploadEndpoint(): Plugin {
	return {
		name: "mediadrop-demo-upload-endpoint",
		configureServer(server) {
			server.middlewares.use("/api/upload", (req, res) => {
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.end();
					return;
				}
				req.resume();
				req.on("end", () => {
					if (Math.random() < 0.25) {
						res.statusCode = 500;
						res.end(
							"Simulated failure — this demo endpoint fails ~25% of uploads on purpose.",
						);
						return;
					}
					res.statusCode = 200;
					res.setHeader("Content-Type", "application/json");
					res.end(
						JSON.stringify({ ok: true, receivedAt: new Date().toISOString() }),
					);
				});
			});
		},
	};
}

export default defineConfig({
	plugins: [react(), devUploadEndpoint()],
});
