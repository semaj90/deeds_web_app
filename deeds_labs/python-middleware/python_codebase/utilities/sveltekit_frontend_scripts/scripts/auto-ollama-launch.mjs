import { execSync, spawn } from "child_process";
import os from "os";
import path from "path";

const SVELTEKIT_FRONTEND_PATH = path.resolve("sveltekit-frontend");
const PS_SCRIPT_PATH = path.join(SVELTEKIT_FRONTEND_PATH, "scripts", "start-ollama-gpu.ps1");

let currentGpuLayers = 0;
let currentThreads = 0;
let ollamaProcess = null;

function detectVRAM() {
  try {
    const out = execSync(
      `nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits`
    )
      .toString()
      .trim();
    return parseInt(out.split("\n")[0]) || 0;
  } catch (error) {
    console.warn("⚠️ Could not detect VRAM — defaulting to 4096 MB. Error:", error.message);
    return 4096;
  }
}

function pickLayers(vram) {
  if (vram >= 12_000) return 32; // full model
  if (vram >= 8_000) return 28;
  if (vram >= 6_000) return 24;
  if (vram >= 4_000) return 18;
  return 12;
}

function pickThreads() {
  const cpus = os.cpus().length;
  return Math.max(4, Math.floor(cpus / 2));
}

function getGpuMetrics() {
  try {
    const out = execSync(
      `nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits`
    )
      .toString()
      .trim();
    const [utilization, memUsed, memTotal, temperature] = out.split(',').map(Number);
    return {
      utilization,
      memUsed, // MiB
      memTotal, // MiB
      temperature,
      vramPct: (memUsed / memTotal) * 100
    };
  } catch (error) {
    console.warn("⚠️ Could not retrieve real-time GPU metrics:", error.message);
    return null;
  }
}

function launchOllama(gpuLayers, threads) {
  if (ollamaProcess) {
    console.log("Stopping existing Ollama process...");
    ollamaProcess.kill();
    ollamaProcess = null;
  }

  console.log(`🚀 Launching Ollama with ${gpuLayers} GPU layers and ${threads} threads...`);
  const args = [
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    PS_SCRIPT_PATH,
    "-GpuLayers",
    gpuLayers,
    "-NumThreads",
    threads,
    "-WaitSeconds",
    "15",
  ];

  ollamaProcess = spawn("pwsh", args, { stdio: "inherit", cwd: SVELTEKIT_FRONTEND_PATH });

  ollamaProcess.on("close", (code) => {
    console.log(`💡 Ollama GPU launch exited with code ${code}`);
    ollamaProcess = null; // Clear process reference
  });

  ollamaProcess.on("error", (err) => {
    console.error("🚨 Failed to start Ollama PowerShell process:", err);
    ollamaProcess = null;
  });
}

async function startWatchdog() {
  const initialVram = detectVRAM();
  currentGpuLayers = pickLayers(initialVram);
  currentThreads = pickThreads();

  console.log(`Initial VRAM: ${initialVram} MB. Starting Ollama with ${currentGpuLayers} layers.`);
  launchOllama(currentGpuLayers, currentThreads);

  setInterval(() => {
    const metrics = getGpuMetrics();
    if (!metrics) return;

    const { utilization, vramPct, temperature } = metrics;
    console.log(`[Watchdog] GPU Util: ${utilization}%, VRAM: ${vramPct.toFixed(1)}%, Temp: ${temperature}°C`);

    let newGpuLayers = currentGpuLayers;

    // Reduce layers if thresholds exceeded
    if (utilization > 90 || vramPct > 95 || temperature > 85) {
      if (currentGpuLayers > 12) { // Don't go below 12 layers
        newGpuLayers = Math.max(12, currentGpuLayers - 4); // Reduce by 4 layers
        console.warn(`🔥 High GPU load detected! Reducing layers from ${currentGpuLayers} to ${newGpuLayers}.`);
      } else {
        console.warn(`🔥 High GPU load detected, but already at minimum layers (${currentGpuLayers}).`);
      }
    } else if (utilization < 50 && vramPct < 70 && currentGpuLayers < pickLayers(initialVram)) {
      // Gradually increase layers if load is low and not at max for initial VRAM
      newGpuLayers = Math.min(pickLayers(initialVram), currentGpuLayers + 2); // Increase by 2 layers
      if (newGpuLayers !== currentGpuLayers) {
        console.log(`❄️ Low GPU load detected. Increasing layers from ${currentGpuLayers} to ${newGpuLayers}.`);
      }
    }

    if (newGpuLayers !== currentGpuLayers) {
      currentGpuLayers = newGpuLayers;
      launchOllama(currentGpuLayers, currentThreads);
    }

  }, 10000); // Poll every 10 seconds
}

startWatchdog();

// --- Ollama Model Path Issue ---
// The user mentioned: "Ollama won’t find gemma3-legal:latest in your repo unless it’s registered with the Ollama local model registry or you override the pat"
// This implies that the Ollama instance launched by this script might not find the model.
// The `start-ollama-gpu.ps1` script launches Ollama with `ollama serve`.
// To make Ollama find models in a specific directory, you can set the OLLAMA_MODELS environment variable.
// However, `ollama serve` typically looks in a default location.
// If `gemma3-legal:latest` is a custom model, it needs to be "pulled" or "created" into Ollama's registry.
// The simplest way to ensure it's available is to have it in Ollama's default model directory,
// or to use `ollama run gemma3-legal:latest` which might implicitly handle paths if the model file is in the CWD.
// For `ollama serve`, the models usually need to be in `%USERPROFILE%/.ollama/models` on Windows.
// If the model is in the repo, the user would need to `ollama create gemma3-legal -f ./Modelfile` from the model's directory.
// This script doesn't directly manage Ollama models, but launches the server.
// The user's comment is a reminder that the model itself needs to be correctly installed/registered with Ollama.
// If not, the user would need to run `ollama create` or `ollama pull` manually.
// I will add a note about this in the script comments.