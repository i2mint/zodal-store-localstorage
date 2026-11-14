import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', lite: 'src/lite.ts' },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
});
