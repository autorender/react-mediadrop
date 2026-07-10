import { randomUUID } from "node:crypto";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Router } from "express";

const PRESIGN_EXPIRES_SECONDS = 900;

function configuredBucket() {
	return process.env.AWS_S3_BUCKET ?? null;
}

function s3Client() {
	return new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
}

function objectKey(filename) {
	const safeName = String(filename ?? "file").replace(/[^\w.-]/g, "_");
	return `mediadrop-demo/${randomUUID()}-${safeName}`;
}

/**
 * S3 routes are real (not a stub) but only reachable once AWS_S3_BUCKET
 * (+ region/credentials, via the default AWS SDK credential chain) is set
 * in the environment — see ../README.md. Every handler checks this first
 * and responds 501 with setup instructions rather than a confusing SDK
 * auth error, since a consumer trying this without a bucket yet is the
 * expected first run, not a misuse.
 */
export function createS3Router() {
	const router = Router();

	router.use((_req, res, next) => {
		if (!configuredBucket()) {
			res.status(501).json({
				error: "S3 not configured",
				detail:
					"Set AWS_S3_BUCKET (and AWS_REGION, plus credentials via the default AWS SDK chain) in examples/test-server/.env to enable the S3 tabs. See examples/test-server/README.md.",
			});
			return;
		}
		next();
	});

	router.post("/presign", async (req, res, next) => {
		try {
			const { filename, contentType } = req.body ?? {};
			const bucket = configuredBucket();
			const key = objectKey(filename);
			const client = s3Client();
			const command = new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				ContentType: contentType || "application/octet-stream",
			});
			const url = await getSignedUrl(client, command, {
				expiresIn: PRESIGN_EXPIRES_SECONDS,
			});
			res.json({
				url,
				method: "PUT",
				headers: { "Content-Type": contentType || "application/octet-stream" },
				key,
				bucket,
			});
		} catch (error) {
			next(error);
		}
	});

	router.post("/multipart/create", async (req, res, next) => {
		try {
			const { filename, contentType } = req.body ?? {};
			const bucket = configuredBucket();
			const key = objectKey(filename);
			const client = s3Client();
			const { UploadId } = await client.send(
				new CreateMultipartUploadCommand({
					Bucket: bucket,
					Key: key,
					ContentType: contentType || "application/octet-stream",
				}),
			);
			res.json({ uploadId: UploadId, key });
		} catch (error) {
			next(error);
		}
	});

	router.post("/multipart/part", async (req, res, next) => {
		try {
			const { key, uploadId, partNumber } = req.body ?? {};
			const bucket = configuredBucket();
			const client = s3Client();
			const command = new UploadPartCommand({
				Bucket: bucket,
				Key: key,
				UploadId: uploadId,
				PartNumber: partNumber,
			});
			const url = await getSignedUrl(client, command, {
				expiresIn: PRESIGN_EXPIRES_SECONDS,
			});
			res.json({ url });
		} catch (error) {
			next(error);
		}
	});

	router.post("/multipart/complete", async (req, res, next) => {
		try {
			const { key, uploadId, parts } = req.body ?? {};
			const bucket = configuredBucket();
			const client = s3Client();
			const result = await client.send(
				new CompleteMultipartUploadCommand({
					Bucket: bucket,
					Key: key,
					UploadId: uploadId,
					MultipartUpload: {
						Parts: parts.map((part) => ({
							PartNumber: part.partNumber,
							ETag: part.etag,
						})),
					},
				}),
			);
			res.json({ key, location: result.Location });
		} catch (error) {
			next(error);
		}
	});

	router.post("/multipart/abort", async (req, res, next) => {
		try {
			const { key, uploadId } = req.body ?? {};
			const bucket = configuredBucket();
			const client = s3Client();
			await client.send(
				new AbortMultipartUploadCommand({
					Bucket: bucket,
					Key: key,
					UploadId: uploadId,
				}),
			);
			res.status(204).end();
		} catch (error) {
			next(error);
		}
	});

	return router;
}
