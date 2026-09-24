// Build configuration: archive.json at the repo root, with the export's
// location overridable through TWITTER_ARCHIVE (it is not in the repo: the
// export contains DMs and other things that must never be published).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(ROOT, 'site');
export const PUBLIC_DIR = path.join(ROOT, 'public');

export async function loadConfig() {
  const cfg = JSON.parse(await readFile(path.join(ROOT, 'archive.json'), 'utf8'));
  cfg.source = process.env.TWITTER_ARCHIVE || cfg.source;
  cfg.featured ||= [];
  return cfg;
}
