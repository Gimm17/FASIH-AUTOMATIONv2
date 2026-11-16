// Builds the content script as an IIFE bundle (content scripts can't be ES modules in MV3).
// Uses Vite's underlying rollup via a programmatic build.
import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/**
 * @param {{input: string, output: string}} opts
 */
export async function buildContentScript(opts) {
  await build({
    configFile: false,
    logLevel: 'warn',
    build: {
      emptyOutDir: false,
      sourcemap: false,
      write: true,
      lib: {
        entry: opts.input,
        name: 'FasihContentScript',
        formats: ['iife'],
        fileName: () => 'fasih-content.js',
      },
      outDir: 'dist/content',
    },
    resolve: {
      alias: {
        '@': resolve(root, 'src'),
        '@shared': resolve(root, 'src/shared'),
        '@matching': resolve(root, 'src/matching'),
        '@excel': resolve(root, 'src/excel'),
        '@ai': resolve(root, 'src/ai'),
        '@site': resolve(root, 'src/site/fasih'),
        '@core': resolve(root, 'src/core'),
        '@persistence': resolve(root, 'src/persistence'),
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });
}
