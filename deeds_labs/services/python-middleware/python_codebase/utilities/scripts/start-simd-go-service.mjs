#!/usr/bin/env node
/**
 * Starts the SIMD Go microservice used by the frontend parsing pipeline.
 *
 * Preference order:
 *   1. go-microservice/simd-parser(.exe) if a compiled binary is present
 *   2. falls back to `go run simd-json-accelerator.go`
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const goRoot = path.resolve(projectRoot, 'go-microservice');

const executableName = process.platform === 'win32' ? 'simd-parser.exe' : 'simd-parser';
const executablePath = path.resolve(goRoot, executableName);
const acceleratorSource = path.resolve(goRoot, 'simd-json-accelerator.go');

let command;
let args = [];
let options = {
  cwd: goRoot,
  stdio: 'inherit',
  shell: false
};

if (existsSync(executablePath)) {
  command = executablePath;
  console.log(`🚀 Launching SIMD microservice binary: ${executableName}`);
} else {
  command = 'go';
  args = ['run', acceleratorSource];
  console.log('⚠️  SIMD binary not found, falling back to `go run simd-json-accelerator.go`');
}

const child = spawn(command, args, options);

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`SIMD service terminated due to signal: ${signal}`);
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on('error', (err) => {
  console.error('Failed to start SIMD service:', err);
  process.exit(1);
});
