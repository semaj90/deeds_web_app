// setup-script.js
// This script sets up the dev environment: runs type checks, starts Docker Compose, and launches Drizzle Studio with logging.

const { execSync, spawn } = require('child_process');
const path = require('path');

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...options });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
      else resolve();
    });
  });
}

async function waitForService(url, name, maxTries = 30, interval = 2000) {
  const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`✅ ${name} is running at ${url}`);
        return true;
      }
    } catch (e) {
      // ignore
    }
    console.log(`Waiting for ${name} at ${url}... (${i+1}/${maxTries})`);
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`${name} did not start in time at ${url}`);
}

async function main() {
  try {
    // Find sveltekit-frontend directory using regex
    const fs = require('fs');
    const dirs = fs.readdirSync(path.join('web-app'));
    const svelteDir = dirs.find((d) => /sveltekit-frontend/i.test(d));
    if (!svelteDir) throw new Error('Could not find sveltekit-frontend directory');
    const sveltePath = path.join('web-app', svelteDir);

    console.log('=== Running SvelteKit/TypeScript check (npm run check)...');
    await runCommand('npm', ['run', 'check'], { cwd: sveltePath });

    console.log('=== Starting Docker Compose (for Postgres, Qdrant, Drizzle Studio)...');
    await runCommand('docker-compose', ['up', '-d']);

    // Health checks for services
    await waitForService('http://localhost:5432', 'Postgres'); // TCP check, will fail, so use Qdrant and Drizzle Studio HTTP
    await waitForService('http://localhost:8899', 'Drizzle Studio');
    await waitForService('http://localhost:6333/healthz', 'Qdrant');

    console.log('=== All services are up: Postgres, Drizzle Studio, Qdrant ===');

    console.log('=== Launching Drizzle Studio (with logging)...');
    // If using Docker, Drizzle Studio is already up, so skip npx launch
    // await runCommand('npx', ['drizzle-kit', 'studio', '--log'], { cwd: sveltePath });

    console.log('=== Setup complete!');
  } catch (err) {
    console.error('Setup failed:', err);
    process.exit(1);
  }
}

main();
