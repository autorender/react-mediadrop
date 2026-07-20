export function buildStackblitzFiles(appCode: string) {
  const componentName = appCode.match(/export function (\w+)/)?.[1] ?? "App";
  return {
    "package.json": JSON.stringify(
      {
        name: "react-mediadrop-example",
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
        },
        dependencies: {
          "react-mediadrop": "^0.1.1",
          react: "^19.2.0",
          "react-dom": "^19.2.0",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^6.0.3",
          "@tailwindcss/vite": "^4",
          tailwindcss: "^4",
          vite: "^8.1.3",
        },
      },
      null,
      2,
    ),
    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>react-mediadrop example</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`,
    "src/main.tsx": `import { createRoot } from "react-dom/client";
import { ${componentName} } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<${componentName} />);
`,
    "src/index.css": `@import "tailwindcss";\n`,
    "src/App.tsx": appCode,
  };
}
