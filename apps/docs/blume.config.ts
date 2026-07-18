import { defineConfig } from "blume";

export default defineConfig({
	title: "react-mediadrop",
	description: "A lightweight, headless-first file uploader for React",
	logo: {
		image: {
			alt: "react-mediadrop",
			light: "/react-mediadrop-oss-logo-colored.svg",
			dark: "/react-mediadrop-oss-logo-colored.svg",
		},
	},
	theme: {
		accent: { light: "#0B6A88", dark: "#61DAFB" },
	},
	markdown: {
		codeBlocks: {
			theme: { light: "github-light", dark: "vesper" },
		},
	},
	github: {
		owner: "autorender",
		repo: "react-mediadrop",
		dir: "apps/docs",
	},
	navigation: {
		repo: true,
	},
	deployment: {
		site: "https://www.mediadrop.dev/docs",
	},
	analytics: {
		posthog: {
			key: "phc_mRwuB9ktYeQwz3tWni5ifqP3Ymby4a3dzuhoQHdH9WrY",
		},
		scripts: [
			{
				src: "https://www.googletagmanager.com/gtag/js?id=G-M2VY77VNNN",
				strategy: "async",
			},
			{
				content:
					"window.dataLayer = window.dataLayer || [];" +
					"function gtag(){dataLayer.push(arguments);}" +
					"gtag('js', new Date());" +
					"gtag('config', 'G-M2VY77VNNN');",
			},
		],
	},
	seo: {
		og: {
			palette: {
				accent: "#0B6A88",
				background: "#020617",
				foreground: "#F8FAFC",
				muted: "#94A3B8",
				border: "#1E293B",
			},
		},
		x: {
			handle: "vasantharb",
			creator: "vasantharb",
		},
	},
	// Reads each page's date from git history — needs full history at build
	// time (no shallow clone in CI).
	lastModified: true,
});
