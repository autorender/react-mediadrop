import { useMediaDrop } from "react-mediadrop";
import { Dropzone } from "../components/shared/Dropzone";
import { FileList } from "../components/shared/FileList";

export default function MaxFilesExample() {
	const { acceptedFiles, rejectedFiles, getRootProps, getInputProps } =
		useMediaDrop({
			restrictions: { maxFiles: 3 },
		});

	return (
		<div className="w-full space-y-3">
			<Dropzone {...getRootProps()}>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<p className="mt-1 text-xs italic">
					3 files max — the rest are rejected
				</p>
			</Dropzone>
			<FileList files={acceptedFiles} />
			<FileList files={rejectedFiles} variant="rejected" />
		</div>
	);
}
