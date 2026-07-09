import { createId } from "./id.js";
import type { MediaDropFile } from "./types.js";

export function createFileItem(file: File): MediaDropFile {
	return {
		id: createId(),
		file,
		name: file.name,
		size: file.size,
		type: file.type,
		lastModified: file.lastModified,
		status: "idle",
		errors: [],
	};
}
