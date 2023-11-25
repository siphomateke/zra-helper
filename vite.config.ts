import { defineConfig } from "vite";
import vue from '@vitejs/plugin-vue2'
import webExtension, { readJsonFile } from "vite-plugin-web-extension";
import { fileURLToPath, URL } from "url";


function generateManifest() {
  const manifest = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");
  return {
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    ...manifest,
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    webExtension({
      manifest: generateManifest,
      watchFilePaths: ["package.json", "manifest.json"],
      disableAutoLaunch: true,
      browser: 'firefox',
      // browser: 'chrome',
      additionalInputs: [
          'src/app.html'
      ]
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('src/', import.meta.url)) },
      { find: '~', replacement: fileURLToPath(new URL('node_modules/', import.meta.url)) },
      { find: '~@/assets', replacement: fileURLToPath(new URL('src/assets', import.meta.url)) },
      { find: "~bulma", replacement: fileURLToPath(new URL("node_modules/bulma/", import.meta.url)) },
      { find: "~@fortawesome", replacement: fileURLToPath(new URL("node_modules/@fortawesome/", import.meta.url)) },
      { find: "~buefy", replacement: fileURLToPath(new URL("node_modules/buefy/", import.meta.url)) },
      { find: "~bulma-tooltip", replacement: fileURLToPath(new URL("node_modules/bulma-tooltip/", import.meta.url)) },
      { find: '~highlight.js', replacement: fileURLToPath(new URL('node_modules/highlight.js/', import.meta.url)) },
      { find: 'styles', replacement: fileURLToPath(new URL('src/assets/scss', import.meta.url)) },
    ],
  },
});
