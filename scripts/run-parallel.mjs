import { spawn } from 'node:child_process';

const commands = process.argv.slice(2);

if (commands.length < 2) {
  console.error('Usage: node scripts/run-parallel.mjs "<cmd1>" "<cmd2>" [cmdN]');
  process.exit(1);
}

const children = [];
let settled = false;
let completed = 0;

const stopAll = () => {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
};

for (const cmd of commands) {
  const child = spawn(cmd, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  children.push(child);

  child.on('error', (error) => {
    if (settled) return;
    settled = true;
    stopAll();
    console.error(`Failed to start command: ${cmd}`);
    console.error(error.message);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (settled) return;

    if (code !== 0) {
      settled = true;
      stopAll();
      if (signal) {
        console.error(`Command terminated by signal (${signal}): ${cmd}`);
      } else {
        console.error(`Command failed (${code}): ${cmd}`);
      }
      process.exit(code ?? 1);
      return;
    }

    completed += 1;
    if (completed === commands.length) {
      settled = true;
      process.exit(0);
    }
  });
}
