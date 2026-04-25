#!/usr/bin/env node
/**
 * Phase 40: BullMQ → RabbitMQ Migration Script
 * Replaces all BullMQ references with RabbitMQ equivalents
 */

import fs from 'fs/promises';

const FILES_TO_MIGRATE = [
  'src/lib/phase14/server/queues/logQueue.ts',
  'src/lib/phase14/server/queues/logWorker.ts',
  'src/lib/phase14/server/workers/logWorker.ts',
  'src/lib/services/job-queue.ts',
  'src/lib/services/queue-service.ts',
  'src/lib/state/evidenceProcessingMachine.ts',
  'src/lib/types/missing-modules.d.ts',
  'src/routes/api/legal-ai/process-document/+server.ts',
  'src/routes/api/log/+server.ts',
  'src/routes/api/upload/presign/+server.ts'
];

const REPLACEMENTS = [
  // Service import replacement
  { from: /import\s+\{\s*bullmqService\s*\}\s+from\s+['"]\.\.\/services\/bullmqService\.js['"]/g, to: "import { rabbitmqService as bullmqService } from '../services/rabbitmq-service.js'" },
  { from: /import\s+\{\s*bullmqService\s*\}\s+from\s+['"]\$lib\/bullmq\/bullmqService['"]/g, to: "import { rabbitmqService as bullmqService } from '$lib/services/rabbitmq-service'" },

  // Import replacements
  { from: /import.*?from\s+['"]bullmq['"]/g, to: "import { RabbitMQQueue, RabbitMQWorker } from '$lib/rabbitmq'" },
  { from: /import\s*\{[^}]*Queue[^}]*\}\s*from\s+['"]bullmq['"]/g, to: "import { RabbitMQQueue } from '$lib/rabbitmq'" },
  { from: /import\s*\{[^}]*Worker[^}]*\}\s*from\s+['"]bullmq['"]/g, to: "import { RabbitMQWorker } from '$lib/rabbitmq'" },

  // Class/type replacements
  { from: /\bQueue\b/g, to: 'RabbitMQQueue' },
  { from: /\bWorker\b/g, to: 'RabbitMQWorker' },
  { from: /\bJob\b(?!\.)/g, to: 'RabbitMQJob' },

  // Connection string
  { from: /redis:\/\/[^'"]+/g, to: 'amqp://legal_admin:123456@localhost:5672' },

  // Comments
  { from: /\/\/.*BullMQ.*/g, to: '// RabbitMQ queue system' },
  { from: /\/\*.*BullMQ.*\*\//g, to: '/* RabbitMQ queue system */' }
];

async function migrateFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf-8');
    let modified = false;

    for (const { from, to } of REPLACEMENTS) {
      const newContent = content.replace(from, to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }

    if (modified) {
      // Backup original
      await fs.writeFile(`${filePath}.bullmq-backup`, content);

      // Write migrated content
      await fs.writeFile(filePath, content);

      console.log(`✅ Migrated: ${filePath}`);
      return { file: filePath, success: true };
    } else {
      console.log(`⏭️  Skipped (no changes): ${filePath}`);
      return { file: filePath, success: true, skipped: true };
    }

  } catch (error) {
    console.error(`❌ Failed: ${filePath} - ${error.message}`);
    return { file: filePath, success: false, error: error.message };
  }
}

async function main() {
  console.log('🔄 BullMQ → RabbitMQ Migration\n');

  const results = [];

  for (const file of FILES_TO_MIGRATE) {
    const result = await migrateFile(file);
    results.push(result);
  }

  const successful = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n📊 Migration Summary:`);
  console.log(`  Migrated: ${successful}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
