#!/usr/bin/env node

async function checkOllamaRunning() {
  try {
    const response = await fetch('http://localhost:11434/api/version', {
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    if (response.ok) {
      console.log('✅ Ollama is already running on port 11434');
      process.exit(1); // Exit with 1 to skip starting Ollama
    }
  } catch (err) {
    // Ollama not running, continue to check if it's installed
  }

  try {
    const { execSync } = await import('node:child_process');
    const version = execSync('ollama --version', { encoding: 'utf8' }).trim();
    console.log(`✅ Ollama installed: ${version} — will start service`);
    process.exit(0); // Allow starting Ollama
  } catch (err) {
    console.warn('⚠️ Ollama not found — skipping Ollama startup');
    process.exit(0); // Allow Vite to continue without Ollama
  }
}

checkOllamaRunning();
