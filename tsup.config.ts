import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', lite: 'src/lite.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  // One self-contained file of the ./lite entry for pages with no build step (zodal#116): load it
  // with <script src> (global `ZodalStoreLocalStorage`) or inline it into a generated page.
  {
    entry: { 'zodal-store-localstorage': 'src/lite.ts' },
    format: ['iife'],
    globalName: 'ZodalStoreLocalStorage',
    minify: true,
    sourcemap: false,
    dts: false,
    clean: false,
    outExtension: () => ({ js: '.iife.js' }),
  },
]);
