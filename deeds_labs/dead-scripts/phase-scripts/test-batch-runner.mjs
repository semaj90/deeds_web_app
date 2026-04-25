#!/usr/bin/env node
/**
 * Test script to verify batch runner functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing batch runner components...\n');

// Test 1: Check if error files exist
const errorFilesPath = path.join(__dirname, '../reports/top-100-error-files.json');
console.log(`1️⃣ Checking error files: ${errorFilesPath}`);
if (fs.existsSync(errorFilesPath)) {
    const errorData = JSON.parse(fs.readFileSync(errorFilesPath, 'utf-8'));
    console.log(`   ✅ Found ${errorData.track1Files?.length || 0} files in track1\n`);

    // Test 2: Load files for Batch 3 (files 21-30)
    const batch3Start = 20; // 0-indexed
    const batch3End = 30;
    const batch3Files = errorData.track1Files.slice(batch3Start, batch3End);
    console.log(`2️⃣ Batch 3 files (21-30):`);
    batch3Files.forEach((file, idx) => {
        console.log(`   ${batch3Start + idx + 1}. ${file.path} (${file.errors} errors)`);
    });
    console.log('');

    // Test 3: Check if enhanced fixer exists
    const fixerPath = path.join(__dirname, 'phase90-enhanced-ast-fixer.mjs');
    console.log(`3️⃣ Checking enhanced fixer: ${fixerPath}`);
    if (fs.existsSync(fixerPath)) {
        console.log(`   ✅ Enhanced fixer found\n`);

        // Test 4: Try importing the fixer
        console.log(`4️⃣ Testing fixer import...`);
        try {
            const fixer = await import('./phase90-enhanced-ast-fixer.mjs');
            console.log(`   ✅ Fixer imported successfully`);
            console.log(`   Exports: ${Object.keys(fixer).join(', ')}\n`);
        } catch (error) {
            console.log(`   ❌ Error importing fixer: ${error.message}\n`);
        }
    } else {
        console.log(`   ❌ Enhanced fixer not found\n`);
    }
} else {
    console.log(`   ❌ Error files not found\n`);
}

console.log('✅ Test complete!\n');
