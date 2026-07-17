import { useMediaDrop } from "react-mediadrop";
import { Dropzone } from "../components/shared/Dropzone";
import { FileList } from "../components/shared/FileList";

function noSpacesValidator(file: File) {
	if (file.name.includes(" ")) {
		return {
			code: "validator-error" as const,
			message: "Filenames can't contain spaces",
		};
	}
	return null;
}

export default function ValidatorExample() {
	const { acceptedFiles, rejectedFiles, getRootProps, getInputProps } =
		useMediaDrop({
			validator: noSpacesValidator,
		});

	return (
		<div className="w-full space-y-3">
			<Dropzone {...getRootProps()}>
				<input {...getInputProps()} />
				<p>Drag files here, or click to browse</p>
				<p className="mt-1 text-xs italic">
					Filenames with spaces are rejected
				</p>
			</Dropzone>
			<FileList files={acceptedFiles} />
			<FileList files={rejectedFiles} variant="rejected" />
		</div>
	);
}
