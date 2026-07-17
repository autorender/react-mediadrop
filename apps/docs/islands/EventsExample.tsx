import { useState } from "react";
import { useMediaDrop } from "react-mediadrop";
import { Dropzone } from "../components/shared/Dropzone";
import { FileList } from "../components/shared/FileList";

export default function EventsExample() {
	const [stopPropagation, setStopPropagation] = useState(false);
	const { acceptedFiles, getRootProps, getInputProps } = useMediaDrop();

	return (
		<div className="w-full space-y-3">
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					checked={stopPropagation}
					onChange={(event) => setStopPropagation(event.target.checked)}
				/>
				Call <code>event.stopPropagation()</code> in a custom onDrop
			</label>
			<Dropzone
				{...getRootProps({
					onDrop: (event) => {
						if (stopPropagation) event.stopPropagation();
					},
				})}
			>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
			</Dropzone>
			{stopPropagation ? (
				<p className="text-sm text-zinc-500 dark:text-zinc-400">
					Stopping propagation yourself skips react-mediadrop&apos;s own drop
					handling — nothing is added below.
				</p>
			) : (
				<FileList files={acceptedFiles} />
			)}
		</div>
	);
}
