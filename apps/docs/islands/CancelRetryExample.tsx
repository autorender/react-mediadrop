import { useEffect, useRef, useState } from "react";
import { useMediaDrop } from "react-mediadrop";
import { createMockTransport } from "./shared/mockTransport";

const buttonStyle: React.CSSProperties = {
	padding: "0.2rem 0.6rem",
	borderRadius: "var(--blume-radius)",
	border: "1px solid var(--blume-border)",
	background: "var(--blume-accent)",
	color: "#fff",
	cursor: "pointer",
	fontSize: "0.8rem",
};

export default function CancelRetryExample() {
	const [forceFail, setForceFail] = useState(false);
	const forceFailRef = useRef(forceFail);
	forceFailRef.current = forceFail;

	const {
		files,
		getRootProps,
		getInputProps,
		uploadFile,
		cancelUpload,
		retryUpload,
	} = useMediaDrop({
		transport: createMockTransport({
			durationMs: 4000,
			shouldFail: () => {
				const shouldFail = forceFailRef.current;
				if (shouldFail) {
					forceFailRef.current = false;
					setForceFail(false);
				}
				return shouldFail;
			},
		}),
	});

	useEffect(() => {
		for (const file of files) {
			if (file.status === "accepted" && file.uploadStatus === undefined) {
				uploadFile(file.id);
			}
		}
	}, [files, uploadFile]);

	return (
		<div>
			<label
				style={{
					display: "flex",
					alignItems: "center",
					gap: "0.5rem",
					fontSize: "0.9rem",
					marginBottom: "0.75rem",
				}}
			>
				<input
					type="checkbox"
					checked={forceFail}
					onChange={(event) => setForceFail(event.target.checked)}
				/>
				Fail the next upload attempt
			</label>
			<div
				{...getRootProps()}
				style={{
					border: "2px dashed var(--blume-border)",
					borderRadius: "var(--blume-radius)",
					padding: "2.5rem 1.5rem",
					textAlign: "center",
					cursor: "pointer",
					color: "var(--blume-muted-foreground)",
				}}
			>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<em>Uploads take 4s — enough time to cancel one mid-flight</em>
			</div>
			<ul
				style={{
					listStyle: "none",
					margin: "1rem 0 0",
					padding: 0,
					display: "flex",
					flexDirection: "column",
					gap: "0.5rem",
					fontSize: "0.9rem",
				}}
			>
				{files.map((file) => {
					const total = file.progress?.total ?? file.size;
					const loaded = file.progress?.loaded ?? 0;
					return (
						<li key={file.id}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									gap: "0.5rem",
								}}
							>
								<span>{file.name}</span>
								<span style={{ color: "var(--blume-muted-foreground)" }}>
									{file.uploadStatus === "error"
										? `error — ${file.uploadError?.message}`
										: (file.uploadStatus ?? file.status)}
								</span>
								{(file.uploadStatus === "queued" ||
									file.uploadStatus === "uploading") && (
									<button
										type="button"
										style={buttonStyle}
										onClick={() => cancelUpload(file.id)}
									>
										Cancel
									</button>
								)}
								{file.uploadStatus === "error" && (
									<button
										type="button"
										style={buttonStyle}
										onClick={() => retryUpload(file.id)}
									>
										Retry
									</button>
								)}
							</div>
							<progress
								value={loaded}
								max={total}
								style={{ width: "100%", height: "6px" }}
							/>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
