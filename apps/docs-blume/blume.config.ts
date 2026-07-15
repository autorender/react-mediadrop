import { defineConfig } from "blume";

export default defineConfig({
  title: "react-mediadrop",
  description: "A lightweight, headless-first file uploader for React",
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
    dir: "apps/docs-blume",
  },
  navigation: {
    repo: true,
    sidebar: {
      display: "group",
    },
  },
});
