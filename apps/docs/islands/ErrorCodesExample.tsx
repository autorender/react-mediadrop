import { useEffect, useRef, useState } from "react";
import { useMediaDrop } from "react-mediadrop";
import { createMockTransport } from "../components/shared/mockTransport";

function noSpacesValidator(file: File) {
	if (file.name.includes(" ")) {
		return {
			code: "validator-error" as const,
			message: "Filenames can't contain spaces",
		};
	}
	return null;
}

export default function ErrorCodesExample() {
	const [forceFail, setForceFail] = useState(false);
	const forceFailRef = useRef(forceFail);
	forceFailRef.current = forceFail;

	const { files, getRootProps, getInputProps, uploadFile } = useMediaDrop({
		restrictions: {
			accept: "image/*",
			minSize: 1024,
			maxSize: 2_000_000,
			maxFiles: 3,
		},
		validator: noSpacesValidator,
		transport: createMockTransport({
			durationMs: 1200,
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
				Fail the next upload attempt (upload-error)
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
				<em>
					Images only, 1 KB&ndash;2 MB, max 3 files, no spaces in the name
				</em>
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
				{files.map((file) => (
					<li key={file.id}>
						<div style={{ display: "flex", justifyContent: "space-between" }}>
							<span>{file.name}</span>
							<span style={{ color: "var(--blume-muted-foreground)" }}>
								{file.uploadStatus ?? file.status}
							</span>
						</div>
						{file.errors.map((error) => (
							<div
								key={error.code}
								style={{ color: "var(--blume-muted-foreground)" }}
							>
								<code>{error.code}</code> &mdash; {error.message}
							</div>
						))}
						{file.uploadError && (
							<div style={{ color: "var(--blume-muted-foreground)" }}>
								<code>{file.uploadError.code}</code> &mdash;{" "}
								{file.uploadError.message}
							</div>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
