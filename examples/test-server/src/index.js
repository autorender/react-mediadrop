import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
await mkdir(UPLOAD_DIR, { recursive: true });

const EXTENSION_BY_MIME = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
};

const PORT = process.env.PORT ?? 8787;

const app = express();

app.use(cors());

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

app.use((error, _req, res, _next) => {
	console.error(error);
	res.status(500).json({ error: error.message ?? "Internal error" });
});

app.listen(PORT, () => {
	console.log(`test-server listening on http://localhost:${PORT}`);
	console.log(`  xhr:  POST http://localhost:${PORT}/api/upload`);
});
