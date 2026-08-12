/**
 * Fetch U.S. Code XML from official source
 * Downloads Title 18 & 28 XML files and stores in MinIO
 */

import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const USC_URL = 'https://uscode.house.gov/download/uscxml.zip';
const TEMP_DIR = '/tmp';
const ZIP_PATH = path.join(TEMP_DIR, 'uscxml.zip');

/**
 * Download U.S. Code XML
 */
async function downloadUSCXML(): Promise<Buffer> {
  console.log('📥 Downloading U.S. Code XML from', USC_URL);

  try {
    const response = await axios.get(USC_URL, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 second timeout
    });

    console.log(`✅ Downloaded ${(response.data.length / 1024 / 1024).toFixed(2)} MB`);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to download U.S. Code XML:', error);
    throw error;
  }
}

/**
 * Save to local filesystem
 */
function saveLocally(data: Buffer): void {
  try {
    fs.writeFileSync(ZIP_PATH, data);
    console.log(`✅ Saved to ${ZIP_PATH}`);
  } catch (error) {
    console.error('❌ Failed to save locally:', error);
    throw error;
  }
}

/**
 * Upload to MinIO
 */
async function uploadToMinIO(data: Buffer): Promise<void> {
  try {
    // Dynamic import to avoid issues at build time
    const { MinioClient } = await import('../src/lib/server/minio');

    console.log('📤 Uploading to MinIO bucket: laws');

    await MinioClient.putObject('laws', 'uscxml.zip', data, data.length);

    console.log('✅ Uploaded to MinIO successfully');
  } catch (error) {
    console.error('❌ Failed to upload to MinIO:', error);
    console.warn('⚠️  MinIO upload failed, but local file saved. You can upload manually.');
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting U.S. Code XML fetch and storage...\n');

    // Download
    const data = await downloadUSCXML();

    // Save locally
    saveLocally(data);

    // Upload to MinIO
    await uploadToMinIO(data);

    console.log('\n✅ U.S. Code XML fetch and storage complete!');
    console.log(`📍 Local path: ${ZIP_PATH}`);
    console.log('📍 MinIO path: laws/uscxml.zip');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { downloadUSCXML, saveLocally, uploadToMinIO };
