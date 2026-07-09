import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// This demo talks to a real backend (see ../../test-server) instead of a
// dev-server mock — see App.tsx's VITE_API_BASE_URL / TRANSPORTS.
export default defineConfig({
	plugins: [react()],
});
