import { spawn } from 'node:child_process';

const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npmBin, ['run', 'dev:api'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npmBin, ['run', 'dev:web'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

let shuttingDown = false;

for (const child of children) {
  child.on('exit', (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChildren();
    process.exit(code ?? 0);
  });
}

process.on('SIGINT', () => {
  shuttingDown = true;
  stopChildren();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  stopChildren();
  process.exit(0);
});

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}
