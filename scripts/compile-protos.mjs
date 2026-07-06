#!/usr/bin/env node

/**
 * Compile Proto Definitions to TypeScript/JavaScript
 *
 * Generates .pb.ts and .pb.js files from .proto definitions in proto/active/
 * Uses protoc with ts-proto plugin (if available) or emits stub for manual maintenance.
 *
 * Usage:
 *   node scripts/compile-protos.mjs [--output-dir]
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '..');
const protoDir = join(repoRoot, 'proto', 'active');
const outputDir = process.argv[2] || join(repoRoot, 'sveltekit-frontend', 'src', 'lib', 'server', 'grpc', 'generated');

console.log('🔧 Proto Compilation Script');
console.log(`📂 Source: ${protoDir}`);
console.log(`📂 Output: ${outputDir}`);

// Verify source directory exists
if (!existsSync(protoDir)) {
  console.error(`❌ Proto directory not found: ${protoDir}`);
  process.exit(1);
}

// Create output directory
mkdirSync(outputDir, { recursive: true });

// List proto files
const protoFiles = readdirSync(protoDir).filter((f) => f.endsWith('.proto'));
console.log(`\n📋 Found ${protoFiles.length} .proto files:`);
protoFiles.forEach((f) => console.log(`   - ${f}`));

// Check for protoc
let protocAvailable = false;
try {
  execSync('protoc --version', { stdio: 'pipe' });
  protocAvailable = true;
  console.log('\n✅ protoc compiler found');
} catch {
  console.log('\n⚠️  protoc compiler NOT found (install via: apt-get install protobuf-compiler)');
}

// Check for protoc-gen-ts_proto plugin
let tsProtoAvailable = false;
try {
  execSync('which protoc-gen-ts_proto', { stdio: 'pipe', shell: '/bin/bash' });
  tsProtoAvailable = true;
  console.log('✅ protoc-gen-ts_proto plugin found');
} catch {
  console.log('⚠️  protoc-gen-ts_proto plugin NOT found (install via: npm install -g ts-proto)');
}

if (!protocAvailable) {
  console.log('\n⚠️  Proto compilation requires protoc. Generating stub index instead...');
  generateStubIndex(protoFiles, outputDir);
  console.log(`\n📄 Generated: ${join(outputDir, 'index.ts')}`);
  process.exit(0);
}

// Generate proto files
console.log('\n🔨 Compiling protos...\n');

try {
  const protoFilePaths = protoFiles.map((f) => join(protoDir, f));

  if (tsProtoAvailable) {
    // Use ts-proto for TypeScript generation
    const cmd = [
      'protoc',
      `--plugin=protoc-gen-ts_proto=$(which protoc-gen-ts_proto)`,
      `--ts_proto_out=${outputDir}`,
      '--ts_proto_opt=env=node',
      '--ts_proto_opt=snakeToCamel=true',
      ...protoFilePaths,
    ].join(' ');

    console.log(`Command: ${cmd}\n`);
    execSync(cmd, { stdio: 'inherit' });
  } else {
    // Fallback: generate basic TypeScript definitions (manual mapping)
    console.log('📝 Generating TypeScript stubs (manual proto mapping required)...\n');
    generateTypeScriptStubs(protoFiles, outputDir);
  }

  console.log('\n✅ Proto compilation complete');
  generateIndexFile(protoFiles, outputDir);
  console.log(`📄 Generated: ${join(outputDir, 'index.ts')}`);
} catch (err) {
  console.error(`\n❌ Compilation failed: ${err.message}`);
  process.exit(1);
}

/**
 * Generate stub index.ts for proto modules
 */
function generateStubIndex(protoFiles, outputDir) {
  const serviceNames = protoFiles
    .map((f) => f.replace('.proto', ''))
    .map((name) => `${toPascalCase(name)}Service`);

  const stubContent = `/**
 * Proto Service Stubs (auto-generated)
 *
 * This is a stub index. Full .pb.ts files require protoc + ts-proto.
 * See scripts/compile-protos.mjs for compilation instructions.
 */

${serviceNames.map((name) => `export class ${name} {}`).join('\n')}

export const PROTO_FILES = {
${protoFiles.map((f) => `  '${f}': true`).join(',\n')}
};
`;

  writeFileSync(join(outputDir, 'index.ts'), stubContent);
}

/**
 * Generate TypeScript stubs from proto file names
 */
function generateTypeScriptStubs(protoFiles, outputDir) {
  for (const protoFile of protoFiles) {
    const name = protoFile.replace('.proto', '');
    const className = toPascalCase(name) + 'Service';

    const stubContent = `/**
 * ${protoFile} - TypeScript Stub
 *
 * This is a placeholder. Full implementation requires:
 *   1. protoc compiler
 *   2. ts-proto plugin
 *   3. Running: npm run compile:protos
 */

export interface ${className}Options {
  // Service configuration
}

export class ${className} {
  constructor(options?: ${className}Options) {}

  // Add service methods here
}

export default ${className};
`;

    const outputFile = join(outputDir, name + '.ts');
    writeFileSync(outputFile, stubContent);
    console.log(`   Generated: ${name}.ts`);
  }
}

/**
 * Generate index.ts barrel export
 */
function generateIndexFile(protoFiles, outputDir) {
  const exports = protoFiles
    .map((f) => f.replace('.proto', ''))
    .map((name) => `export * from './${name}.js';`);

  const indexContent = `/**
 * Proto Service Exports (generated)
 *
 * This file is auto-generated by scripts/compile-protos.mjs
 */

${exports.join('\n')}
`;

  writeFileSync(join(outputDir, 'index.ts'), indexContent);
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str) {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
