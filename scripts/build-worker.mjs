import { build } from 'esbuild';

await build({
  entryPoints: ['functions/_worker.ts'],
  outfile: 'dist/_worker.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  conditions: ['workerd', 'worker', 'browser'],
  logLevel: 'info',
});
