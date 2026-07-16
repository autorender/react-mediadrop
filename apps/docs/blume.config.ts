import { defineConfig } from "blume";

export default defineConfig({
  title: "react-mediadrop",
  description: "A lightweight, headless-first file uploader for React",
  logo: {
    image: { alt: "react-mediadrop", light: "/favicon.png" },
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
  seo: {
    og: {
      palette: { accent: "#0B6A88" },
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
