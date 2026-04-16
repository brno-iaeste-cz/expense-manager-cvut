import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const requiredBindings = ['FIREBASE_PROJECT_ID', 'APPS_SCRIPT_WEB_APP_URL', 'APPS_SCRIPT_SECRET'];
const vars = readDevVars('.dev.vars');
const missing = requiredBindings.filter((key) => !vars[key]);

if (missing.length > 0) {
  console.error(`Missing required local bindings in .dev.vars: ${missing.join(', ')}`);
  process.exit(1);
}

const args = [
  'pages',
  'dev',
  'dist',
  '--compatibility-date=2026-04-16',
];

for (const key of requiredBindings) {
  args.push('--binding', `${key}=${vars[key]}`);
}

const wranglerBin = resolve('node_modules/wrangler/bin/wrangler.js');
const child = spawn(process.execPath, [wranglerBin, ...args], {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }

  process.exit(code ?? 0);
});

function readDevVars(path) {
  const content = readFileSync(path, 'utf8');
  const result = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}
