// Bundle the search app (Lit + refrakt) with esbuild into site/js/.
// `--watch` rebuilds on change (run `npm run build` first so site/ exists).
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, OUT_DIR } from './config.js';

const options = {
  entryPoints: [path.join(ROOT, 'web/search.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outdir: path.join(OUT_DIR, 'js'),
  sourcemap: true,
  minify: true,
  logLevel: 'info',
};

export async function bundle({ watch = false } = {}) {
  if (watch) {
    const ctx = await esbuild.context({ ...options, minify: false });
    await ctx.watch();
    return ctx;
  }
  return esbuild.build(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  bundle({ watch: process.argv.includes('--watch') }).catch(() => process.exit(1));
}
