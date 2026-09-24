// Push site/ to the live server: an rsync into the sm service's data volume,
// which its Caddy serves directly — no image rebuild, no restart. Builds
// first unless --no-build is given.
//
// Config follows sm's conventions: SUPRAMUNDANE (host), SM_REMOTE_USER,
// SM_DATA_ROOT. The service name comes from deploy/service.json.
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, OUT_DIR } from './config.js';

export async function deployConfig() {
  const svc = JSON.parse(await readFile(path.join(ROOT, 'deploy/service.json'), 'utf8'));
  const host = process.env.SUPRAMUNDANE || '';
  const user = process.env.SM_REMOTE_USER || '';
  const dataRoot = process.env.SM_DATA_ROOT || '/srv/supramundane/data';
  return {
    service: svc.name,
    host,
    target: user ? `${user}@${host}` : host,
    dest: `${dataRoot}/${svc.name}/`,
    domains: svc.domains.prod,
  };
}

export async function publish({ log = console.log } = {}) {
  const cfg = await deployConfig();
  if (!cfg.host) throw new Error('No remote host: export SUPRAMUNDANE=<ip-or-hostname> (see the sm README).');
  try {
    await stat(path.join(OUT_DIR, 'index.html'));
  } catch {
    throw new Error('Nothing to publish: build the site first.');
  }
  const started = Date.now();
  // The caddy image keeps its own state in /data/caddy; an excluded path is
  // also protected from --delete, so it survives the sync.
  const args = ['-az', '--delete', '--itemize-changes', '--exclude', '*.map', '--exclude', '/caddy', `${OUT_DIR}/`, `${cfg.target}:${cfg.dest}`];
  log(`rsync → ${cfg.target}:${cfg.dest}`);
  const changed = await run('rsync', args, log);
  const ms = Date.now() - started;
  return { ...cfg, changed, ms, summary: `published ${changed} change${changed === 1 ? '' : 's'} to https://${cfg.domains[0]}/ in ${(ms / 1000).toFixed(1)}s` };
}

function run(cmd, args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let changed = 0;
    let err = '';
    child.stdout.on('data', (d) => {
      for (const line of d.toString().split('\n')) {
        // itemize lines start with a change flag string like ">f+++++++++"
        if (/^[<>ch.*]/.test(line) && !line.startsWith('.d')) {
          changed++;
          if (changed <= 200) log(line);
          else if (changed === 201) log('…');
        }
      }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(changed) : reject(new Error(`rsync failed (${code}): ${err.trim()}`))));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--no-build')) {
    const { build } = await import('./index.js');
    await build();
  }
  publish()
    .then((r) => console.log(r.summary))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
