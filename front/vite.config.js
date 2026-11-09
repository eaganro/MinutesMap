import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Tells public/preload-data.js where the game data lives (it runs before the app, so it can't
// read import.meta.env). Without VITE_PREFIX it gets nothing and leaves the data to the app.
const dataPrefixPlugin = (prefix) => ({
  name: 'minutesmap-data-prefix',
  transformIndexHtml(html) {
    if (prefix === undefined) return html;
    const attribute = ` data-prefix="${prefix.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    return html.replace(
      '<script src="/preload-data.js"',
      `<script src="/preload-data.js"${attribute}`,
    );
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), dataPrefixPlugin(loadEnv(mode, process.cwd(), 'VITE_').VITE_PREFIX)],
  base: '/',
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    cssCodeSplit: false,
    rolldownOptions: {
      input: resolve(import.meta.dirname, 'index.html'),
      output: {
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/chunks/[name]-[hash].js',

        assetFileNames: (assetInfo) => {
          const name = assetInfo.names ? assetInfo.names[0] : assetInfo.name;
          if (name && name.endsWith('.css')) {
            return 'css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
}));
