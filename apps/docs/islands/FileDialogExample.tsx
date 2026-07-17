import { useMediaDrop } from "react-mediadrop";
import { Button } from "./shared/Button";
import { Dropzone } from "./shared/Dropzone";
import { FileList } from "./shared/FileList";

export default function FileDialogExample() {
	const { acceptedFiles, getRootProps, getInputProps, open } = useMediaDrop({
		noClick: true,
		noKeyboard: true,
	});

	return (
		<div className="w-full space-y-3">
			<Dropzone {...getRootProps()}>
				<input {...getInputProps()} />
				<p>Drag files here — clicking the dropzone itself does nothing</p>
				<Button className="mt-3" onClick={open}>
					Choose files
				</Button>
			</Dropzone>
			<FileList files={acceptedFiles} />
		</div>
	);
}
