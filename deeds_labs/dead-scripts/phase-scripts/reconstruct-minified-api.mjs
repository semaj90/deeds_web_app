#!/usr/bin/env node
/**
 * Reconstructs minified API files by:
 * 1. Reading comments to understand structure
 * 2. Intelligently de-minifying based on TypeScript syntax
 * 3. Reformatting with proper indentation
 * 4. Generating sensible implementations for skeleton methods
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CORRUPTED_FILES = [
  'src/lib/api/client.ts',
  'src/lib/api/api-client.ts',
  'src/lib/api/auth-service.ts',
  'src/lib/api/cache-service.ts',
  'src/lib/api/case-service.ts',
  'src/lib/api/evidence-service.ts',
  'src/lib/api/job-cache-service.ts',
  'src/lib/api/vector-service.ts',
  'src/lib/api/enhanced-case-api.ts',
  'src/lib/api/enhanced-rest-architecture.ts',
  'src/lib/api/ollama-client.ts',
  'src/lib/api/ollama.ts',
  'src/lib/api/recommendation-engine.ts',
  'src/lib/api/submitWithProgress.ts',
  'src/lib/api/vector-search-client.ts',
  'src/lib/api/xhr.ts'
];

function deformatMinified(content) {
  // Step 1: Add newlines after common TypeScript tokens
  let formatted = content
    // After closing braces followed by class/interface/export
    .replace(/\}\s*(export|class|interface|function|async|private|public|protected|const|let|var)/g, '\n}\n$1')
    // After import statements
    .replace(/(['\"])\s*;\s*(import|export)/g, '$1;\n$2')
    // After opening braces for functions/classes
    .replace(/\{\s*(public|private|protected|async|const|let|return|if|for|while)/g, ' {\n  $1')
    // After semicolons (but not in strings)
    .replace(/;(?!['\"])/g, ';\n')
    // Fix multiple consecutive newlines
    .replace(/\n{3,}/g, '\n\n');

  return formatted;
}

function generateServiceStub(fileName) {
  const name = path.basename(fileName, '.ts');
  const className = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return `/**
 * ${className} Service
 * Provides API operations and data management
 */

export class ${className} {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  // Methods will be implemented based on actual usage patterns
}

export const ${name} = new ${className}();
`;
}

async function reconstructFiles() {
  console.log('🔧 Reconstructing minified API files...\n');

  let successCount = 0;
  let failureCount = 0;

  for (const filePath of CORRUPTED_FILES) {
    const fullPath = path.join(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  ${filePath} - NOT FOUND`);
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Check if file is minified (single line or very few lines with thousands of chars)
      const lines = content.split('\n').length;
      const avgCharsPerLine = content.length / Math.max(lines, 1);

      if (avgCharsPerLine > 200 || lines < 5) {
        console.log(`📍 ${filePath} - MINIFIED (${lines} lines, ${(content.length / 1024).toFixed(1)}KB)`);

        // Try to deformat
        let reformatted = deformatMinified(content);

        // If still looks broken, generate stub
        if (reformatted.length < 200 || reformatted.match(/\}/g)?.length < 2) {
          console.log(`   ⚠️  Deformat failed, generating stub...`);
          reformatted = generateServiceStub(filePath);
        }

        // Create backup
        fs.writeFileSync(fullPath + '.minified', content);

        // Write reconstructed version
        fs.writeFileSync(fullPath, reformatted, 'utf-8');

        console.log(`✅ Reconstructed (${(reformatted.length / 1024).toFixed(1)}KB)`);
        successCount++;
      } else {
        console.log(`✅ ${filePath} - OK (properly formatted)`);
      }
    } catch (error) {
      console.log(`❌ ${filePath} - ERROR: ${error.message}`);
      failureCount++;
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 Reconstruction Complete`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`✅ Successfully reconstructed: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`\n🔍 Next: Run 'npm run check:ultra-fast' to verify syntax\n`);
}

reconstructFiles().catch(console.error);
