#!/usr/bin/env node
/**
 * Installation script for Agentic Controller dependencies
 * Installs OCR, AST parsing, and computer vision packages
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Installing Agentic Controller dependencies...\n');

// Core dependencies for the agentic system
const dependencies = [
  // OCR and Computer Vision
  'tesseract.js',          // OCR text extraction
  'sharp',                 // Image processing

  // File watching and processing
  'chokidar',             // File system watcher

  // Database and caching
  'redis',                // Redis client
  'pg',                   // PostgreSQL client
  'pgvector',             // PostgreSQL vector extension

  // AST parsing
  '@typescript-eslint/parser',  // TypeScript AST parser
  '@babel/parser',              // JavaScript AST parser
  'svelte',                     // Svelte parser (already installed)

  // HTTP client
  'node-fetch'            // Fetch polyfill for Node.js
];

// Optional dependencies (install if available)
const optionalDeps = [
  'yolov8-node'           // YOLO computer vision (may need compilation)
];

function runCommand(command, description) {
  try {
    console.log(`📦 ${description}...`);
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log(`✅ ${description} completed\n`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

function createDirectories() {
  console.log('📁 Creating required directories...');

  const dirs = [
    'errors',           // Screenshot error directory
    'scripts',          // Scripts directory (should already exist)
    'logs'              // Logs directory
  ];

  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`   Created: ${dir}/`);
    } else {
      console.log(`   Exists: ${dir}/`);
    }
  });

  console.log('✅ Directories ready\n');
}

function installDependencies() {
  console.log('📦 Installing core dependencies...');

  const installCommand = `npm install ${dependencies.join(' ')}`;

  if (runCommand(installCommand, 'Installing core packages')) {
    console.log('✅ Core dependencies installed successfully\n');
  } else {
    console.log('❌ Core dependency installation failed\n');
    process.exit(1);
  }
}

function installOptionalDependencies() {
  console.log('🔧 Installing optional dependencies...');

  optionalDeps.forEach(dep => {
    const success = runCommand(`npm install ${dep}`, `Installing ${dep}`);
    if (!success) {
      console.log(`⚠️  ${dep} installation failed (optional - continuing)`);
    }
  });

  console.log('✅ Optional dependencies processed\n');
}

function createConfigFile() {
  console.log('⚙️ Creating configuration file...');

  const config = {
    agentic: {
      enabled: true,
      redis: {
        url: process.env.REDIS_URL || "redis://localhost:6379",
        password: process.env.REDIS_PASSWORD || "redis"
      },
      postgres: {
        connectionString: process.env.DATABASE_URL || "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"
      },
      ollama: {
        url: process.env.OLLAMA_URL || "http://localhost:11434",
        embedModel: "embeddinggemma:latest"
      },
      ocr: {
        enabled: true,
        language: "eng",
        confidence_threshold: 0.3
      },
      yolo: {
        enabled: false, // Enable manually if yolov8-node installed successfully
        model: "yolov8n.pt"
      },
      paths: {
        watchDir: "sveltekit-frontend/src/**/*.{ts,svelte,js}",
        errorDir: "errors",
        logsDir: "logs"
      }
    }
  };

  const configPath = path.join(__dirname, '..', 'agentic-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log('✅ Configuration file created: agentic-config.json\n');
}

function createStartScript() {
  console.log('📝 Creating start script...');

  const startScript = `#!/usr/bin/env node
/**
 * Start script for Agentic Controller
 * Usage: npm run agentic [mode]
 * Modes: watch (default), analyze <image>, query <error>
 */

const { spawn } = require('child_process');
const path = require('path');

const mode = process.argv[2] || 'watch';
const args = process.argv.slice(3);

const controllerPath = path.join(__dirname, 'agentic-controller.mjs');

console.log(\`🤖 Starting Agentic Controller [mode=\${mode}]\\n\`);

const controller = spawn('node', [controllerPath, mode, ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'development'
  }
});

controller.on('close', (code) => {
  if (code !== 0) {
    console.error(\`\\n❌ Agentic Controller exited with code \${code}\`);
    process.exit(code);
  } else {
    console.log('\\n✅ Agentic Controller shut down gracefully');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n🛑 Shutting down Agentic Controller...');
  controller.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\\n🛑 Terminating Agentic Controller...');
  controller.kill('SIGTERM');
});
`;

  const scriptPath = path.join(__dirname, 'start-agentic.js');
  fs.writeFileSync(scriptPath, startScript);
  fs.chmodSync(scriptPath, '755'); // Make executable

  console.log('✅ Start script created: scripts/start-agentic.js\n');
}

function updatePackageJson() {
  console.log('📋 Updating package.json scripts...');

  const packageJsonPath = path.join(__dirname, '..', 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      // Add agentic scripts
      packageJson.scripts = packageJson.scripts || {};
      packageJson.scripts['agentic'] = 'node scripts/start-agentic.js';
      packageJson.scripts['agentic:watch'] = 'node scripts/start-agentic.js watch';
      packageJson.scripts['agentic:analyze'] = 'node scripts/start-agentic.js analyze';
      packageJson.scripts['agentic:query'] = 'node scripts/start-agentic.js query';

      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Package.json scripts updated\n');

      return true;
    } catch (error) {
      console.warn('⚠️  Could not update package.json:', error.message);
      return false;
    }
  } else {
    console.warn('⚠️  package.json not found - skipping script updates');
    return false;
  }
}

function displayUsage() {
  console.log('🎉 Agentic Controller installation complete!\n');
  console.log('📖 Usage:');
  console.log('  npm run agentic                 # Start file watcher (default)');
  console.log('  npm run agentic:watch          # Start file watcher');
  console.log('  npm run agentic:analyze <img>   # Analyze screenshot');
  console.log('  npm run agentic:query <error>   # Query for fix suggestions');
  console.log('');
  console.log('🔧 API Endpoints:');
  console.log('  GET  /api/v1/agentic?action=status        # System status');
  console.log('  GET  /api/v1/agentic?action=recent-errors # Recent errors');
  console.log('  POST /api/v1/agentic (multipart)          # Upload screenshot');
  console.log('  POST /api/v1/agentic (json)               # Analyze error text');
  console.log('');
  console.log('📁 Directories:');
  console.log('  errors/    # Drop error screenshots here');
  console.log('  logs/      # System logs');
  console.log('  scripts/   # Controller scripts');
  console.log('');
  console.log('⚙️  Configuration: agentic-config.json');
  console.log('');
}

// Main installation process
async function main() {
  try {
    createDirectories();
    installDependencies();
    installOptionalDependencies();
    createConfigFile();
    createStartScript();
    updatePackageJson();
    displayUsage();

    console.log('🚀 Ready to start the Agentic Controller!');
    console.log('   Run: npm run agentic');

  } catch (error) {
    console.error('❌ Installation failed:', error);
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  main();
}

module.exports = { main };