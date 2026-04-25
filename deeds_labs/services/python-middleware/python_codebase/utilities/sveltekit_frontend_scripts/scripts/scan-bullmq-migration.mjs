#!/usr/bin/env node
/**
 * BullMQ → RabbitMQ Migration Scanner
 * Scans codebase for BullMQ usage and provides migration report
 */
import fs from "fs";
import path from "path";
import { glob } from "glob";

const root = path.resolve(".");
const reportPath = "bullmq-to-rabbitmq-migration-report.json";

const searchPatterns = [
  /import.*['"]bullmq['"]/g,
  /require\(['"]bullmq['"]\)/g,
  /new Queue\(/g,
  /new Worker\(/g,
  /new QueueScheduler\(/g,
  /\.add\(/g,
  /\.process\(/g,
];

async function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const matches = [];

  searchPatterns.forEach((pattern, idx) => {
    const found = content.match(pattern);
    if (found) {
      matches.push({
        pattern: pattern.source,
        occurrences: found.length,
        lines: content.split('\n').map((line, lineNum) => 
          pattern.test(line) ? lineNum + 1 : null
        ).filter(Boolean)
      });
    }
  });

  return matches.length > 0 ? { file: filePath, matches } : null;
}

async function main() {
  console.log("🔍 Scanning for BullMQ usage...\n");

  const files = await glob("src/**/*.{ts,js,svelte}", {
    ignore: ["**/node_modules/**", "**/.svelte-kit/**"]
  });

  const results = [];
  for (const file of files) {
    const result = await scanFile(file);
    if (result) {
      results.push(result);
      console.log(`📦 Found BullMQ in: ${file}`);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    totalFiles: files.length,
    filesWithBullMQ: results.length,
    details: results,
    migrationPlan: {
      step1: "Install amqplib: npm install amqplib",
      step2: "Replace Queue imports with amqplib channel creation",
      step3: "Replace Worker imports with consumer patterns",
      step4: "Update job.add() calls to channel.sendToQueue()",
      step5: "Test with RabbitMQ at amqp://legal_admin:123456@localhost:5672"
    },
    replacementGuide: {
      "Queue": "channel.assertQueue()",
      "Worker": "channel.consume()",
      "job.add()": "channel.sendToQueue()",
      "job.process()": "channel.consume() callback"
    }
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files scanned: ${files.length}`);
  console.log(`   Files with BullMQ: ${results.length}`);
  console.log(`\n📄 Full report: ${reportPath}`);
  
  if (results.length > 0) {
    console.log(`\n🔧 Migration Required:`);
    console.log(`   1. npm install amqplib`);
    console.log(`   2. Replace BullMQ imports with amqplib`);
    console.log(`   3. Update job patterns (see ${reportPath})`);
  } else {
    console.log(`\n✅ No BullMQ usage found - RabbitMQ ready!`);
  }
}

main().catch(console.error);
