import { spawn } from 'node:child_process';

const commands = [
  ['--experimental-sqlite', '--watch', 'server/index.js'],
  ['node_modules/vite/bin/vite.js'],
];
const children = commands.map((args) => spawn(process.execPath, args, { stdio: 'inherit' }));
let shuttingDown = false;

function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = exitCode;
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Could not start a development process:', error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
