// A separate entry point (published as the "react-mediadrop/xhr-upload"
// subpath) so consumers who don't use this transport don't pay for it —
// importing "react-mediadrop" alone never pulls this file in, since
// nothing in index.ts imports from here. @mediadrop/xhr-upload is a
// workspace-only, unpublished package inlined into this entry's own dist
// file at build time (see tsdown.config.ts), the same way @mediadrop/core
// is inlined into every entry.
export type {
	XhrUploadFields,
	XhrUploadHeaders,
	XhrUploadOptions,
} from "@mediadrop/xhr-upload";
export { createXhrUploadTransport } from "@mediadrop/xhr-upload";
