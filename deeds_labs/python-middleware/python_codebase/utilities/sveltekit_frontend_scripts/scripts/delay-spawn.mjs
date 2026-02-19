import { spawn } from 'child_process';

const args = process.argv.slice(2);
const delayIndex = args.indexOf('--delay');
let delay = 0;

if (delayIndex > -1) {
  delay = parseInt(args[delayIndex + 1], 10);
  args.splice(delayIndex, 2); // Remove --delay and its value
}

// The actual command to run is everything after the first '--'
const commandSeparatorIndex = args.indexOf('--');
let command = [];
let commandArgs = [];

if (commandSeparatorIndex > -1) {
  command = args[commandSeparatorIndex + 1];
  commandArgs = args.slice(commandSeparatorIndex + 2);
} else {
  // If no '--' is found, assume the entire remaining part is the command and its arguments
  command = args[0]; // Assuming the first argument is the command
  commandArgs = args.slice(1);
}

if (!command) {
  console.error('Error: No command specified to run.');
  process.exit(1);
}

console.log(`[delay-spawn] Waiting for ${delay}ms before spawning command: ${command} ${commandArgs.join(' ')}`);

setTimeout(() => {
  const child = spawn(command, commandArgs, { stdio: 'inherit', shell: true });

  child.on('error', (err) => {
    console.error(`[delay-spawn] Failed to start subprocess: ${err.message}`);
    process.exit(1);
  });

  child.on('close', (code) => {
    console.log(`[delay-spawn] Subprocess exited with code ${code}`);
    process.exit(code);
  });
}, delay);