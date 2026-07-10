import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileStore } from "@tus/file-store";
import { Server as TusServer } from "@tus/server";
import cors from "cors";
import express from "express";
import { createS3Router } from "./s3-routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const TUS_DIR = path.join(__dirname, "..", "tus-data");
await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(TUS_DIR, { recursive: true });

const EXTENSION_BY_MIME = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
};

const PORT = process.env.PORT ?? 8787;

const app = express();

app.use(
	cors({
		exposedHeaders: [
			"Location",
			"Upload-Offset",
			"Upload-Length",
			"Upload-Metadata",
			"Tus-Resumable",
		],
	}),
);

// XHR transport (`formData: false`) sends the raw file body with no
// filename attached — see @mediadrop/core's sendXhr. Capture whatever
// bytes/content-type arrive and name the file ourselves.
app.post(
	"/api/upload",
	express.raw({ type: () => true, limit: "20mb" }),
	async (req, res, next) => {
		try {
			const contentType = req.headers["content-type"] ?? "";
			const ext = EXTENSION_BY_MIME[contentType] ?? "";
			const filename = `${randomUUID()}${ext}`;
			await writeFile(path.join(UPLOAD_DIR, filename), req.body);
			res.json({
				filename,
				size: req.body.length,
				url: `/uploads/${filename}`,
			});
		} catch (error) {
			next(error);
		}
	},
);

app.use("/uploads", express.static(UPLOAD_DIR));

const tusServer = new TusServer({
	path: "/api/tus",
	datastore: new FileStore({ directory: TUS_DIR }),
});
const tusApp = express();
tusApp.use((req, res) => tusServer.handle(req, res));
app.use("/api/tus", tusApp);

app.use("/api/s3", express.json(), createS3Router());

app.use((error, _req, res, _next) => {
	console.error(error);
	res.status(500).json({ error: error.message ?? "Internal error" });
});

app.listen(PORT, () => {
	console.log(`test-server listening on http://localhost:${PORT}`);
	console.log(`  xhr:  POST http://localhost:${PORT}/api/upload`);
	console.log(`  tus:  POST http://localhost:${PORT}/api/tus`);
	console.log(
		`  s3:   ${process.env.AWS_S3_BUCKET ? `configured (${process.env.AWS_S3_BUCKET})` : "not configured — see README.md"}`,
	);
});
