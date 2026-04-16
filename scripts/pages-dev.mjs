import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { assertRequiredBindings, readDevVars, requiredBindings } from './dev-vars.mjs';

const vars = readDevVars();
assertRequiredBindings(vars);

const args = ['pages', 'dev', 'dist', '--compatibility-date=2026-04-16'];

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
