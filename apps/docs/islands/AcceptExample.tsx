import { useMediaDrop } from "react-mediadrop";
import { Dropzone } from "./shared/Dropzone";
import { FileList } from "./shared/FileList";

export default function AcceptExample() {
	const {
		acceptedFiles,
		rejectedFiles,
		getRootProps,
		getInputProps,
		isDragAccept,
		isDragReject,
	} = useMediaDrop({ restrictions: { accept: ["image/png", "image/jpeg"] } });

	return (
		<div className="w-full space-y-3">
			<Dropzone {...getRootProps()} accept={isDragAccept} reject={isDragReject}>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<p className="mt-1 text-xs italic">
					Only PNG and JPEG images are accepted
				</p>
			</Dropzone>
			<FileList files={acceptedFiles} />
			<FileList files={rejectedFiles} variant="rejected" />
		</div>
	);
}
