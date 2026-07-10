import { useState } from "react";
import { TRANSPORTS, type TransportKey } from "./transports.js";
import { Uploader } from "./Uploader.js";

export function App() {
	const [selected, setSelected] = useState<TransportKey>("xhr");
	const activeTransport = TRANSPORTS[selected];

	return (
		<main className="page">
			<h1>@mediadrop/react demo</h1>
			<p className="subtitle">
				One React app, every transport mediadrop ships — switch below to
				re-mount the dropzone against a different <code>UploadTransport</code>.
				Accepts PNG/JPEG/WebP, up to 5 files, 5 MB each. Needs{" "}
				<code>../test-server</code> running locally to actually upload anything.
			</p>

			<div className="transport-picker">
				{(Object.keys(TRANSPORTS) as TransportKey[]).map((key) => (
					<button
						key={key}
						type="button"
						className={`transport-tab${selected === key ? " transport-tab--active" : ""}`}
						onClick={() => setSelected(key)}
					>
						{TRANSPORTS[key].label}
					</button>
				))}
			</div>
			<p className="transport-description">{activeTransport.description}</p>
			{activeTransport.requiresAwsSetup ? (
				<p className="hint hint--setup">
					Needs <code>AWS_S3_BUCKET</code>/<code>AWS_REGION</code> set in{" "}
					<code>test-server/.env</code> — see <code>test-server/README.md</code>
					.
				</p>
			) : null}

			<Uploader key={selected} transportKey={selected} />
		</main>
	);
}
