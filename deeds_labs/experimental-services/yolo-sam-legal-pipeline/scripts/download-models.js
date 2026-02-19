const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream/promises');

const MODELS_DIR = path.join(__dirname, '..', 'models');

// Model URLs (these would be actual Hugging Face or other model repository URLs)
const MODELS = {
  'sam_vit_b.onnx': 'https://huggingface.co/facebook/sam-vit-base/resolve/main/sam_vit_b.onnx',
  'yolo_legal.onnx': 'https://example.com/models/yolo_legal.onnx', // Placeholder
};

async function downloadFile(url, filepath) {
  console.log(`Downloading ${url} to ${filepath}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.statusText}`);
  }

  const fileStream = fs.createWriteStream(filepath);
  await pipeline(response.body, fileStream);

  console.log(`✅ Downloaded ${filepath}`);
}

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.promises.access(dirPath);
  } catch {
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

async function downloadModels() {
  console.log('Starting model downloads for YOLO/SAM Legal Pipeline...');

  await ensureDirectoryExists(MODELS_DIR);

  const downloadPromises = Object.entries(MODELS).map(async ([filename, url]) => {
    const filepath = path.join(MODELS_DIR, filename);

    try {
      // Check if file already exists
      await fs.promises.access(filepath);
      console.log(`✅ ${filename} already exists, skipping download`);
    } catch {
      // File doesn't exist, download it
      await downloadFile(url, filepath);
    }
  });

  try {
    await Promise.all(downloadPromises);
    console.log('🎉 All models downloaded successfully!');
    console.log('Models directory:', MODELS_DIR);
  } catch (error) {
    console.error('❌ Error downloading models:', error);
    throw error;
  }
}

// For now, create placeholder model files since actual downloads might fail
async function createPlaceholderModels() {
  console.log('Creating placeholder model files...');

  await ensureDirectoryExists(MODELS_DIR);

  // Create a simple placeholder ONNX model (this won't work for actual inference)
  const placeholderContent = Buffer.from('Placeholder ONNX model file');

  for (const filename of Object.keys(MODELS)) {
    const filepath = path.join(MODELS_DIR, filename);
    try {
      await fs.promises.access(filepath);
      console.log(`✅ ${filename} already exists`);
    } catch {
      await fs.promises.writeFile(filepath, placeholderContent);
      console.log(`✅ Created placeholder ${filename}`);
    }
  }

  console.log('⚠️  Note: These are placeholder files. For actual functionality,');
  console.log('   download real YOLO and SAM models from their respective repositories.');
}

// Run download if called directly
if (require.main === module) {
  downloadModels().catch(async (error) => {
    console.log('Download failed, creating placeholders instead...');
    await createPlaceholderModels();
  });
}

module.exports = { downloadModels, createPlaceholderModels };