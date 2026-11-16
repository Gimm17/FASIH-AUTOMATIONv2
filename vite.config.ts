import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContentScript } from './scripts/build-content.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Multi-entry Chrome Extension MV3 build.
 * - Side panel: standard Vite HTML build (sidepanel/index.html)
 * - Service worker: src/background/service-worker.ts → dist/background/service-worker.js (ES module)
 * - Content script: src/content/fasih-content.ts → dist/content/fasih-content.js (IIFE bundle)
 * - manifest.json copied to dist/
 */

const extensionBuildPlugin: Plugin = {
  name: 'fasih-extension-build',
  apply: 'build',
  closeBundle: async () => {
    // Content script (IIFE) — built separately so it never becomes an ES module
    // (content scripts can't use import/export in MV3 without type:module quirks).
    await buildContentScript({
      input: resolve(__dirname, 'src/content/fasih-content.ts'),
      output: resolve(__dirname, 'dist/content/fasih-content.js'),
    });

    // Copy manifest.json → dist/manifest.json
    const manifestSrc = resolve(__dirname, 'manifest.json');
    const manifestDest = resolve(__dirname, 'dist/manifest.json');
    mkdirSync(dirname(manifestDest), { recursive: true });
    if (existsSync(manifestSrc)) copyFileSync(manifestSrc, manifestDest);
  },
};

export default defineConfig({
  plugins: [react(), extensionBuildPlugin],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel/index.html'),
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk: { name: string }) => {
          if (chunk.name === 'background/service-worker') {
            return 'background/service-worker.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@matching': resolve(__dirname, 'src/matching'),
      '@excel': resolve(__dirname, 'src/excel'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@site': resolve(__dirname, 'src/site/fasih'),
      '@core': resolve(__dirname, 'src/core'),
      '@persistence': resolve(__dirname, 'src/persistence'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
});
