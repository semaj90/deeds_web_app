#!/usr/bin/env node

/**
 * Fix TypeScript syntax errors caused by extra semicolons in function parameters
 */

import fs from 'fs';

// Files that need fixing based on comprehensive TypeScript error search
const filesToFix = [
  // Core framework files
  'src/lib/optimization/context7-mcp-integration.ts',
  'src/lib/parsers/simd-json-parser.ts',
  'src/lib/routing/dynamic-navigation.ts',
  'src/lib/routing/dynamic-route-generator.ts',
  'src/lib/routing/route-guards.ts',
  'src/lib/routing/route-registry.ts',
  'src/lib/routing/unified-api-router.ts',
  'src/lib/routing/multidimensional-routing-matrix.ts',

  // Server infrastructure
  'src/lib/server/ai/config.ts',
  'src/lib/server/ai/ollama-config.ts',
  'src/lib/server/ai/rag-pipeline-enhanced.ts',
  'src/lib/server/auth/authUtils.ts',
  'src/lib/server/cache/redis.ts',
  'src/lib/server/db/qdrant-integration.ts',
  'src/lib/server/db/vector-schema.ts',
  'src/lib/server/db/schema-types.ts',
  'src/lib/server/monitoring/logger.ts',
  'src/lib/server/session.ts',
  'src/lib/server/utils/avatar-upload.ts',
  'src/lib/server/websocket.ts',

  // State management
  'src/lib/machines/legal-case-machine-factory.ts',
  'src/lib/stores/aiHistoryStore.ts',
  'src/lib/stores/casesStore.ts',
  'src/lib/stores/chat-store.ts',
  'src/lib/stores/chat.svelte.ts',
  'src/lib/stores/comprehensive-types.ts',
  'src/lib/stores/machines/aiProcessingMachine.ts',
  'src/lib/stores/sessionManager.svelte.ts',
  'src/lib/state/legalFormMachine.ts',

  // Schemas and types
  'src/lib/schemas.ts',
  'src/lib/schemas/auth.ts',
  'src/lib/schemas/file-upload.ts',
  'src/lib/schemas/forms.ts',
  'src/lib/types/dependencies.d.ts',
  'src/lib/types/drizzle-enhanced.d.ts',
  'src/lib/types/gpu-cache-integration.ts',
  'src/lib/types/langchain-ollama-types.ts',

  // Services
  'src/lib/services/quic-gateway-client.ts',
  'src/lib/services/rabbitmq-service.ts',
  'src/lib/services/unsloth-finetuning.ts',
  'src/lib/services/user-chat-recommendation-engine.ts',
  'src/lib/services/types/quic-types.ts',
  'src/lib/services/ai-error-fixer.ts',
  'src/lib/services/ai-worker-manager.ts',
  'src/lib/services/automated-barrel-store-generator.ts',
  'src/lib/services/comprehensive-missing-imports-orchestrator.ts',
  'src/lib/services/context7-missing-imports-fetcher.ts',
  'src/lib/services/context7-multicore.ts',
  'src/lib/services/context7-phase13-integration.ts',
  'src/lib/services/enhanced-ocr-processor.ts',
  'src/lib/services/enhanced-rag-self-organizing.ts',
  'src/lib/services/enhancedRAGPipeline.ts',
  'src/lib/services/gpu-service-orchestrator.ts',
  'src/lib/services/inlineSuggestionService.ts',
  'src/lib/services/live-agent-orchestrator.ts',
  'src/lib/services/llamacpp-ollama-integration.ts',
  'src/lib/services/master-service-coordinator.ts',
  'src/lib/services/neo4jGraphService.ts',
  'src/lib/services/nes-cache-orchestrator.ts',
  'src/lib/services/nvidiaLlamaService.ts',
  'src/lib/services/unified-loki-fuzzy-search.ts',
  'src/lib/services/web-fetch-missing-implementations.ts',
  'src/lib/services/webgpu-som-error-fixer.ts',
  'src/lib/services/webgpu-texture-streaming.ts',

  // Orchestration and caching
  'src/lib/caching/advanced-cache-manager.ts',
  'src/lib/orchestration/cognitive-routing-orchestrator.ts',
  'src/lib/orchestration/master-cognitive-hub.ts',
  'src/lib/optimization/comprehensive-orchestrator.ts',

  // Components and utilities
  'src/lib/components/three/yorha-ui/components/YoRHaQuantumEffects3D.ts',
  'src/lib/utils/cuid.ts',

  // API routes
  'src/routes/api/ai/chat-mock/+server.ts',
  'src/routes/api/ai/vector-search/stream/+server.ts',
  'src/routes/api/cluster/+server.ts',
  'src/routes/api/evidence/upload.ts',
  'src/routes/api/health/all/+server.ts',
  'src/routes/api/rag/vector-health/+server.ts',
  'src/routes/api/ollama/pull/+server.ts',
  'src/routes/profile/drizzle-zod-superforms-example.ts',
  'src/routes/test-enhanced-upload/+page.server.ts',

  // Tests
  'src/lib/tests/integration-workflow.test.ts',
];

function fixSyntaxErrors(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ File not found: ${filePath}`);
      return false;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let changes = 0;

    // Fix pattern 1: "(;" at start of parameter list
    const pattern1 = /\(\s*;/g;
    if (content.match(pattern1)) {
      content = content.replace(pattern1, '(');
      changes++;
      console.log(`📝 Fixed parameter list semicolons in ${filePath}`);
    }

    // Fix pattern 1a: "[;" at start of array list
    const pattern1a = /\[\s*;/g;
    if (content.match(pattern1a)) {
      content = content.replace(pattern1a, '[');
      changes++;
      console.log(`📝 Fixed array list semicolons in ${filePath}`);
    }

    // Fix pattern 1b: "<;" at start of generic type
    const pattern1b = /<\s*;/g;
    if (content.match(pattern1b)) {
      content = content.replace(pattern1b, '<');
      changes++;
      console.log(`📝 Fixed generic type semicolons in ${filePath}`);
    }

    // Fix pattern 1c: "{;" at start of object
    const pattern1c = /\{\s*;/g;
    if (content.match(pattern1c)) {
      content = content.replace(pattern1c, '{');
      changes++;
      console.log(`📝 Fixed object semicolons in ${filePath}`);
    }

    // Fix pattern 1d: "for ( " missing first semicolon
    const pattern1d = /for\s*\(\s+([^;]+;)/g;
    if (content.match(pattern1d)) {
      content = content.replace(pattern1d, 'for (; $1');
      changes++;
      console.log(`📝 Fixed for loop semicolons in ${filePath}`);
    }

    // Fix pattern 2: Missing semicolons at end of statements
    // This is trickier and more context-dependent, so we'll be conservative

    // Fix pattern 3: Malformed object properties
    const pattern3 = /(\w+)\s*:\s*;/g;
    if (content.match(pattern3)) {
      content = content.replace(pattern3, '$1;');
      changes++;
      console.log(`📝 Fixed object property semicolons in ${filePath}`);
    }

    // Fix pattern 4: Unterminated string literals (basic case)
    // This is context-sensitive, so we'll handle specific patterns

    // Fix pattern 5: Expression expected errors - often missing commas
    const pattern5 = /,\s*;/g;
    if (content.match(pattern5)) {
      content = content.replace(pattern5, ',');
      changes++;
      console.log(`📝 Fixed comma semicolon pattern in ${filePath}`);
    }

    if (changes > 0) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Fixed ${changes} syntax issues in ${filePath}`);
      return true;
    } else {
      console.log(`ℹ️ No syntax fixes needed in ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
console.log('🔧 Starting TypeScript syntax error fixes...\n');

let totalFixed = 0;
let totalFiles = 0;

for (const file of filesToFix) {
  totalFiles++;
  if (fixSyntaxErrors(file)) {
    totalFixed++;
  }
}

console.log(`\n📊 Summary: Fixed ${totalFixed} out of ${totalFiles} files`);

// Additional specific fixes for known patterns
console.log('\n🎯 Applying specific fixes for known patterns...');

// Fix legal-case-machine-factory.ts specific issues
const machineFactoryPath = 'src/lib/machines/legal-case-machine-factory.ts';
if (fs.existsSync(machineFactoryPath)) {
  try {
    let content = fs.readFileSync(machineFactoryPath, 'utf8');

    // Fix common XState machine syntax issues
    content = content.replace(/,\s*\}\s*,/g, '}');
    content = content.replace(/:\s*\{\s*;/g, ': {');
    content = content.replace(/states:\s*;/g, 'states: {');

    fs.writeFileSync(machineFactoryPath, content, 'utf8');
    console.log('✅ Applied specific fixes to legal-case-machine-factory.ts');
  } catch (error) {
    console.error('❌ Error fixing legal-case-machine-factory.ts:', error.message);
  }
}

console.log('\n🎉 Syntax fix process completed!');
