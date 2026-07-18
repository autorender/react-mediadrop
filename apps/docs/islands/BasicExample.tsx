import { useMediaDrop } from "react-mediadrop";
import { Dropzone } from "../components/shared/Dropzone";
import { FileList } from "../components/shared/FileList";

export default function BasicExample() {
	const { acceptedFiles, getRootProps, getInputProps, isDragActive } =
		useMediaDrop();

	return (
		<div className="w-full space-y-3">
			<Dropzone {...getRootProps()} active={isDragActive}>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
			</Dropzone>
			<FileList files={acceptedFiles} />
		</div>
	);
}
