import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Every endpoint below is a local, dev-server-only stand-in for a real
 * backend — real HTTP requests and responses (so the actual transport
 * code in @mediadrop/xhr-upload / @mediadrop/s3 / @mediadrop/tus runs
 * unmodified), but storage is in-memory and discarded on restart. None
 * of this is a production backend; see each package's README for what a
 * real one needs to do (S3 signing, a real tus server, etc).
 */

function readBody(req: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

/**
 * A generic upload endpoint for `@mediadrop/xhr-upload`. It drains the
 * request and responds with a small JSON body — it does not read or
 * persist the uploaded file. It fails roughly 1 in 4 requests on
 * purpose, so the demo's retry/error UI has something real to show
 * without you having to simulate a network failure yourself.
 */
function devXhrEndpoint(): Plugin {
	return {
		name: "mediadrop-demo-xhr",
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

/** Stand-in for a presigned S3 PUT target. */
function devS3SimpleEndpoint(): Plugin {
	return {
		name: "mediadrop-demo-s3-simple",
		configureServer(server) {
			server.middlewares.use("/api/s3-simple", async (req, res) => {
				if (req.method !== "PUT" && req.method !== "POST") {
					res.statusCode = 405;
					res.end();
					return;
				}
				await readBody(req);
				res.statusCode = 200;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ ok: true }));
			});
		},
	};
}

type MultipartUpload = {
	key: string;
	parts: Map<number, { size: number; etag: string }>;
};

/** Stand-in for the three backend calls S3 multipart signing needs. */
function devS3MultipartEndpoint(): Plugin {
	const uploads = new Map<string, MultipartUpload>();

	return {
		name: "mediadrop-demo-s3-multipart",
		configureServer(server) {
			server.middlewares.use(
				"/api/s3-multipart",
				async (req, res: ServerResponse) => {
					const url = new URL(req.url ?? "/", "http://localhost");

					if (req.method === "POST" && url.pathname === "/create") {
						const uploadId = randomUUID();
						uploads.set(uploadId, {
							key: `demo/${uploadId}`,
							parts: new Map(),
						});
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify({ uploadId, key: `demo/${uploadId}` }));
						return;
					}

					if (req.method === "PUT" && url.pathname === "/part") {
						const uploadId = url.searchParams.get("uploadId") ?? "";
						const partNumber = Number(url.searchParams.get("partNumber"));
						const upload = uploads.get(uploadId);
						if (!upload) {
							res.statusCode = 404;
							res.end("Unknown uploadId");
							return;
						}
						const body = await readBody(req);
						const etag = `"demo-etag-${uploadId}-${partNumber}"`;
						upload.parts.set(partNumber, { size: body.length, etag });
						res.setHeader("ETag", etag);
						res.statusCode = 200;
						res.end();
						return;
					}

					if (req.method === "POST" && url.pathname === "/complete") {
						const body = JSON.parse((await readBody(req)).toString("utf8")) as {
							uploadId: string;
							key: string;
						};
						uploads.delete(body.uploadId);
						res.setHeader("Content-Type", "application/json");
						res.end(
							JSON.stringify({ key: body.key, location: `/demo/${body.key}` }),
						);
						return;
					}

					res.statusCode = 404;
					res.end();
				},
			);
		},
	};
}

type TusUpload = { length: number; offset: number };

/** A minimal tus server: POST create, HEAD/PATCH to resume and append. */
function devTusEndpoint(): Plugin {
	const uploads = new Map<string, TusUpload>();

	return {
		name: "mediadrop-demo-tus",
		configureServer(server) {
			server.middlewares.use("/api/tus", async (req, res: ServerResponse) => {
				res.setHeader("Tus-Resumable", "1.0.0");
				const path = req.url ?? "/";

				if (req.method === "POST" && path === "/") {
					const id = randomUUID();
					const length = Number(req.headers["upload-length"] ?? 0);
					uploads.set(id, { length, offset: 0 });
					res.statusCode = 201;
					res.setHeader("Location", `/api/tus/${id}`);
					res.end();
					return;
				}

				const id = path.replace(/^\//, "");
				const upload = uploads.get(id);
				if (!upload) {
					res.statusCode = 404;
					res.end();
					return;
				}

				if (req.method === "HEAD") {
					res.setHeader("Upload-Offset", String(upload.offset));
					res.setHeader("Upload-Length", String(upload.length));
					res.statusCode = 200;
					res.end();
					return;
				}

				if (req.method === "PATCH") {
					const body = await readBody(req);
					upload.offset += body.length;
					res.setHeader("Upload-Offset", String(upload.offset));
					res.statusCode = 204;
					res.end();
					return;
				}

				res.statusCode = 405;
				res.end();
			});
		},
	};
}

export default defineConfig({
	plugins: [
		react(),
		devXhrEndpoint(),
		devS3SimpleEndpoint(),
		devS3MultipartEndpoint(),
		devTusEndpoint(),
	],
});
