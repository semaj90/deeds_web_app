import { spawn } from 'child_process';

console.log('Starting auto-pusher...');
const child = spawn('npx.cmd', ['drizzle-kit', 'generate'], { 
  env: process.env, 
  shell: true,
  stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', d => {
  const str = d.toString();
  process.stdout.write(str);
  
  if (str.includes('rename enum') || str.includes('rename table') || str.includes('rename column') || str.includes('❯')) {
    console.log('[auto-answer] sending ENTER for: ' + str.trim());
    child.stdin.write('\r\n');
  }
});

child.stderr.on('data', d => {
  process.stderr.write(d);
});

child.on('exit', code => {
  console.log('Finished with code', code);
  process.exit(code);
});
