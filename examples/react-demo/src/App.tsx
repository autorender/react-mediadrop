import { useState } from "react";
import { TRANSPORTS, type TransportKey } from "./transports.js";
import { Uploader } from "./Uploader.js";

export function App() {
	const [selected, setSelected] = useState<TransportKey>("xhr");
	const activeTransport = TRANSPORTS[selected];

	return (
		<main className="page">
			<h1>react-mediadrop demo</h1>
			<p className="subtitle">
				One React app driving <code>react-mediadrop/xhr-upload</code> against a real
				local backend. Accepts PNG/JPEG/WebP, up to 5 files, 5 MB each. Needs{" "}
				<code>examples/test-server</code> running locally to actually upload
				anything.
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

			<Uploader key={selected} transportKey={selected} />
		</main>
	);
}
