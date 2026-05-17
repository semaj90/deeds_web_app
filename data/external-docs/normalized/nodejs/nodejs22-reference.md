# Node.js 22 Runtime & Standard Library Reference Manual

This manual documents features, modules, execution environments, filesystem primitives, and server-side APIs compiled for Node.js 22 (LTS).

---

## 1. Native ES Modules and File Import Assertions

Node.js 22 supports full ECMAScript Modules (ESM) including standard JSON assertions and directory resolution bindings.

```javascript
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve current directory path in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadConfig() {
  const configPath = resolve(__dirname, './config.json');
  const data = await readFile(configPath, 'utf8');
  return JSON.parse(data);
}
```

---

## 2. Modern Promisified Filesystem Primitives

Node.js provides synchronous and asynchronous promisified fs utilities inside the `node:fs/promises` namespace.

```javascript
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

async function setupWorkspace(dirPath) {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  const manifestPath = resolve(dirPath, 'manifest.txt');
  await writeFile(manifestPath, 'Initial workspace state verified.');

  const files = await readdir(dirPath);
  console.log(`Created workspace with files: ${files.join(', ')}`);
}
```

---

## 3. High-Performance Child Processes & Spawn

Manage standalone asynchronous server workers or CLI executables using standard OS pipelines.

```javascript
import { spawn } from 'node:child_process';

function launchServiceWorker(command, args) {
  const process = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'production' }
  });

  process.on('close', (code) => {
    console.log(`Service process exited with status code: ${code}`);
  });
}
```