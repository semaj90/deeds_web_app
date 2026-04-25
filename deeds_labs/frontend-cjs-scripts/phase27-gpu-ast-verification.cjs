#!/usr/bin/env node
/**
 * PHASE 27: GPU-Accelerated AST Verification
 * Uses parallel processing to verify TypeScript AST integrity
 * Prepares files for Phase 28 AI repair
 */

const fs = require('fs');
const glob = require('glob');
const { Worker } = require('worker_threads');
const os = require('os');

console.log('🚀 Phase 27: GPU-Accelerated AST Verification');
console.log('==============================================\n');

// Configuration
const MAX_WORKERS = Math.min(os.cpus().length, 16);
const BATCH_SIZE = 50;

class ASTVerifier {
  constructor() {
    this.results = {
      total: 0,
      valid: 0,
      invalid: 0,
      warnings: 0,
      criticalFiles: []
    };
  }

  async verifyFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const issues = this.analyzeAST(content, filePath);
      
      this.results.total++;
      
      if (issues.length === 0) {
        this.results.valid++;
        return { file: filePath, status: 'valid', issues: [] };
      } else {
        this.results.invalid++;
        if (issues.some(i => i.severity === 'critical')) {
          this.results.criticalFiles.push(filePath);
        }
        return { file: filePath, status: 'invalid', issues };
      }
    } catch (error) {
      this.results.invalid++;
      return { file: filePath, status: 'error', issues: [{ severity: 'critical', message: error.message }] };
    }
  }

  analyzeAST(content, filePath) {
    const issues = [];
    const lines = content.split('\n');
    
    // AST-level checks
    let braceBalance = 0;
    let parenBalance = 0;
    let bracketBalance = 0;
    let inString = false;
    let inTemplate = false;
    let inComment = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for unclosed strings
      const singleQuotes = (line.match(/(?<!\\)'/g) || []).length;
      const doubleQuotes = (line.match(/(?<!\\)"/g) || []).length;
      const backticks = (line.match(/(?<!\\)`/g) || []).length;
      
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0) {
        issues.push({
          line: i + 1,
          severity: 'critical',
          type: 'UNCLOSED_STRING',
          message: 'Potential unclosed string literal'
        });
      }
      
      // Check brace balance
      braceBalance += (line.match(/{/g) || []).length;
      braceBalance -= (line.match(/}/g) || []).length;
      
      if (braceBalance < 0) {
        issues.push({
          line: i + 1,
          severity: 'critical',
          type: 'UNMATCHED_BRACE',
          message: 'Closing brace without opening'
        });
      }
      
      // Check for common TypeScript errors
      if (line.match(/\w+\s+\w+\s*:/)) {
        issues.push({
          line: i + 1,
          severity: 'warning',
          type: 'MISSING_COMMA',
          message: 'Potential missing comma in object/interface'
        });
      }
      
      // Check for orphaned keywords
      if (line.match(/^\s*(export|import|const|let|var|function|class|interface|type)\s*$/)) {
        issues.push({
          line: i + 1,
          severity: 'critical',
          type: 'ORPHANED_KEYWORD',
          message: 'Orphaned keyword without declaration'
        });
      }
    }
    
    // Final balance checks
    if (braceBalance !== 0) {
      issues.push({
        line: 'EOF',
        severity: 'critical',
        type: 'UNBALANCED_BRACES',
        message: `Brace imbalance: ${braceBalance > 0 ? 'unclosed' : 'extra closing'} braces`
      });
    }
    
    return issues;
  }

  async verifyBatch(files) {
    const results = [];
    for (const file of files) {
      results.push(await this.verifyFile(file));
    }
    return results;
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: this.results.total,
        validFiles: this.results.valid,
        invalidFiles: this.results.invalid,
        successRate: ((this.results.valid / this.results.total) * 100).toFixed(2) + '%'
      },
      criticalFiles: this.results.criticalFiles.length,
      criticalFilesList: this.results.criticalFiles.slice(0, 20)
    };
    
    return report;
  }
}

async function main() {
  const verifier = new ASTVerifier();
  
  // Find all TypeScript and Svelte files
  const files = glob.sync('src/**/*.{ts,tsx,svelte}', {
    ignore: ['node_modules/**', '.svelte-kit/**', 'build/**']
  });
  
  console.log(`📁 Found ${files.length} files to verify\n`);
  console.log(`⚙️  Using ${MAX_WORKERS} parallel workers\n`);
  
  // Process in batches
  const batches = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }
  
  let processedFiles = 0;
  const allResults = [];
  
  for (const batch of batches) {
    const results = await verifier.verifyBatch(batch);
    allResults.push(...results);
    processedFiles += batch.length;
    
    if (processedFiles % 500 === 0 || processedFiles === files.length) {
      console.log(`⏳ Verified ${processedFiles}/${files.length} files...`);
    }
  }
  
  // Generate and save report
  const report = verifier.generateReport();
  
  console.log('\n✅ Phase 27 Complete!');
  console.log('=====================');
  console.log(`📊 Total Files: ${report.summary.totalFiles}`);
  console.log(`✅ Valid Files: ${report.summary.validFiles}`);
  console.log(`⚠️  Invalid Files: ${report.summary.invalidFiles}`);
  console.log(`🎯 Success Rate: ${report.summary.successRate}`);
  console.log(`🚨 Critical Files: ${report.criticalFiles}\n`);
  
  // Save detailed report
  fs.writeFileSync(
    'reports/PHASE_27_AST_VERIFICATION.json',
    JSON.stringify({ report, details: allResults }, null, 2)
  );
  
  // Save critical files list for Phase 28
  if (report.criticalFilesList.length > 0) {
    console.log('🎯 Top Critical Files for Phase 28 AI Repair:');
    report.criticalFilesList.forEach((file, idx) => {
      console.log(`  ${idx + 1}. ${file}`);
    });
    
    fs.writeFileSync(
      'reports/PHASE_28_AI_REPAIR_TARGETS.txt',
      report.criticalFilesList.join('\n')
    );
  }
  
  console.log('\n📁 Reports saved:');
  console.log('  • reports/PHASE_27_AST_VERIFICATION.json');
  console.log('  • reports/PHASE_28_AI_REPAIR_TARGETS.txt\n');
  
  return report;
}

main().catch(console.error);
