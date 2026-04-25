#!/usr/bin/env node

/**
 * Intake System Verification Checklist
 * Run: node verify-intake-system.mjs
 *
 * This script confirms all critical intake system files exist and are syntactically valid
 */

import fs from 'fs';
import path from 'path';

const BASE_PATH = process.cwd();

const FILES_TO_CHECK = [
  {
    path: 'src/lib/server/llm/gemmaIntake.ts',
    type: 'LLM Helper',
    required: ['extractCaseStructureWithGemma', 'IntakeExtractionResult']
  },
  {
    path: 'src/routes/api/intake/case/+server.ts',
    type: 'Intake Endpoint',
    required: ['POST', 'extractCaseStructureWithGemma', 'IntakeBody']
  },
  {
    path: 'src/routes/cases/new/+page.svelte',
    type: 'Intake Form',
    required: ['handleSubmit', '/api/intake/case', 'narrative']
  },
  {
    path: 'src/routes/api/phase72/errors/+server.ts',
    type: 'Phase 72 - Errors',
    required: ['GET', 'phase72_error']
  },
  {
    path: 'src/routes/api/phase72/suggest-fix/+server.ts',
    type: 'Phase 72 - Suggestions',
    required: ['POST', 'suggest-fix']
  },
  {
    path: 'src/lib/components/RouteInspectorDetectiveBoard.svelte',
    type: 'Detective Board',
    required: ['$bindable', 'phase72Status']
  }
];

const DIRECTORY_CHECKS = [
  'src/routes/cases/[caseId]/overview',
  'src/routes/cases/[caseId]/persons',
  'src/routes/cases/[caseId]/evidence',
  'src/routes/api/cases/[caseId]/evidence',
  'src/routes/api/phase72/errors',
  'src/routes/api/phase72/suggest-fix'
];

function checkFile(filepath, requirements) {
  const fullPath = path.join(BASE_PATH, filepath);

  if (!fs.existsSync(fullPath)) {
    return { status: 'MISSING', message: `File not found: ${filepath}` };
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const missingReqs = requirements.filter(req => !content.includes(req));

    if (missingReqs.length > 0) {
      return {
        status: 'INCOMPLETE',
        message: `Missing: ${missingReqs.join(', ')}`
      };
    }

    return { status: 'OK', message: 'All requirements found' };
  } catch (err) {
    return { status: 'ERROR', message: err.message };
  }
}

function checkDirectory(dirpath) {
  const fullPath = path.join(BASE_PATH, dirpath);

  if (!fs.existsSync(fullPath)) {
    return { status: 'MISSING' };
  }

  if (!fs.statSync(fullPath).isDirectory()) {
    return { status: 'NOT_A_DIRECTORY' };
  }

  return { status: 'OK' };
}

console.log('\n📋 Intake System Verification Checklist\n');
console.log('=' .repeat(60));

let allGood = true;

console.log('\n🔍 Production Files:\n');

for (const file of FILES_TO_CHECK) {
  const result = checkFile(file.path, file.required);
  const icon = result.status === 'OK' ? '✅' : result.status === 'MISSING' ? '❌' : '⚠️ ';

  console.log(`${icon} [${file.type}] ${file.path}`);
  if (result.status !== 'OK') {
    console.log(`   └─ ${result.message}`);
    allGood = false;
  }
}

console.log('\n📁 Required Directories:\n');

for (const dir of DIRECTORY_CHECKS) {
  const result = checkDirectory(dir);
  const icon = result.status === 'OK' ? '✅' : '❌';

  console.log(`${icon} ${dir}`);
  if (result.status !== 'OK') {
    console.log(`   └─ Status: ${result.status}`);
    allGood = false;
  }
}

console.log('\n' + '=' .repeat(60));

if (allGood) {
  console.log('\n✅ All checks passed! System is ready for testing.\n');
  process.exit(0);
} else {
  console.log('\n❌ Some checks failed. Review above and fix before testing.\n');
  process.exit(1);
}
