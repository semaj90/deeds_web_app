#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const svelteKitPath = join(projectRoot, 'sveltekit-frontend');

console.log('🚀 Starting Local Development Server (Fallback Mode)...\n');

// Track child processes for cleanup
const childProcesses = new Set();

// Graceful shutdown handler
function gracefulShutdown(signal) {
    console.log(`\n📡 Received ${signal}. Gracefully shutting down development server...`);

    // Stop all child processes
    childProcesses.forEach(child => {
        if (!child.killed) {
            console.log(`  ⏹ Stopping process ${child.pid}...`);
            child.kill('SIGTERM');
        }
    });

    console.log('✅ Local development server stopped');
    process.exit(0);
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function startLocalDev() {
    try {
      console.log("📝 Note: This is fallback mode without Docker containers");
      console.log(
        "📝 For full QUIC stack, restart Docker Desktop and use: npm run dev:quic\n"
      );

      // Start Vite development server directly
      console.log("🟢 Starting Vite development server...");
      const viteServer = spawn("npm", ["run", "dev"], {
        cwd: svelteKitPath,
        stdio: "inherit",
        env: {
          ...process.env,
          // Set environment variables for local development
          DATABASE_URL:
            process.env.DATABASE_URL ||
            "postgresql://legal_admin:123456@localhost:5433/legal_ai_db",
          REDIS_URL: process.env.REDIS_URL || "redis://:redis@localhost:6379",
          REDIS_PASSWORD: process.env.REDIS_PASSWORD || "redis",
          NODE_ENV: "development",
          PORT: "5173",
        },
      });

      childProcesses.add(viteServer);

      // Wait a moment for server to start
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Optionally start the local Python LangChain RAG service without REDIS_PASSWORD
      try {
        const langchainPath = join(projectRoot, "langchain-rag-service");
        // Only attempt to start if the folder exists
        const fs = await import("fs");
        if (fs.existsSync(langchainPath)) {
          console.log(
            "\n🐍 Starting LangChain RAG Python service (with REDIS_PASSWORD cleared for local dev)..."
          );
          // Clone env and remove REDIS_PASSWORD for the Python process so it won't attempt AUTH
          const envForPython = { ...process.env };
          if ("REDIS_PASSWORD" in envForPython)
            delete envForPython.REDIS_PASSWORD;
          // Keep REDIS_URL but ensure it doesn't contain an inline password
          // (leave REDIS_URL as-is; most Python clients won't call AUTH if REDIS_PASSWORD is absent)
          envForPython.PYTHONUNBUFFERED = "1";

          const pythonService = spawn("python", ["main.py"], {
            cwd: langchainPath,
            stdio: "inherit",
            env: envForPython,
          });
          childProcesses.add(pythonService);
        } else {
          console.log(
            "\n🐍 LangChain RAG service directory not found at",
            langchainPath,
            "- skipping Python service start"
          );
        }
      } catch (err) {
        console.warn(
          "⚠️ Failed to start LangChain RAG Python service:",
          err && err.message ? err.message : err
        );
      }

      console.log("\n🎉 Local Development Server is running!");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("📍 Access Points:");
      console.log("   🌐 Frontend (local):     http://localhost:5173");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(
        "💡 External services (PostgreSQL, Redis) should be running separately"
      );
      console.log(
        "💡 For QUIC support, restart Docker Desktop and use: npm run dev:quic"
      );
      console.log("💡 Press Ctrl+C to stop the development server");
      console.log("");

      // Keep the process alive
      const keepAlive = setInterval(() => {
        // This keeps the process running
      }, 1000);

      // Clean up interval on shutdown
      process.on("exit", () => {
        clearInterval(keepAlive);
      });
    } catch (error) {
        console.error('❌ Failed to start local development server:', error.message);
        process.exit(1);
    }
}

// Start the local development server
startLocalDev().catch(error => {
    console.error('❌ Error starting local development server:', error);
    process.exit(1);
});