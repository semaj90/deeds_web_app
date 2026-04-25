#!/usr/bin/env node
/**
 * AI-ASSISTED ERROR FIXER
 * 
 * Uses Ollama + Gemma3 for intelligent TypeScript error resolution
 * Generates fix suggestions with human review workflow
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = 'gemma3:270m';
const BATCH_SIZE = parseInt(process.argv[2]) || 50;  // Default: 50 errors

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║        AI-Assisted TypeScript Error Fixer (Gemma3)              ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

console.log(`📊 Configuration:`);
console.log(`   • Ollama: ${OLLAMA_URL}`);
console.log(`   • Model: ${MODEL}`);
console.log(`   • Batch size: ${BATCH_SIZE} errors\n`);

// Check Ollama connectivity
async function checkOllama() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) throw new Error('Ollama not responding');
    console.log('✅ Ollama connection successful\n');
    return true;
  } catch (error) {
    console.log(`❌ Cannot connect to Ollama at ${OLLAMA_URL}`);
    console.log(`   Error: ${error.message}`);
    console.log(`\n💡 Start Ollama with: ollama serve\n`);
    return false;
  }
}

// Get AI suggestion for fixing code
async function getAIFixSuggestion(errorContext) {
  const prompt = `You are a TypeScript expert. Fix this error and return ONLY the corrected code line, nothing else.

Error: ${errorContext.error}
File: ${errorContext.file}
Line ${errorContext.line}: ${errorContext.code}

Return only the fixed line of code:`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,  // Low temperature for consistent fixes
          top_p: 0.9
        }
      })
    });

    const result = await response.json();
    return result.response.trim();
  } catch (error) {
    return null;
  }
}

// Parse TypeScript errors
function parseTypeScriptErrors() {
  console.log('📋 Parsing TypeScript errors...\n');
  
  const errors = execSync('npx tsc --noEmit --skipLibCheck 2>&1', { encoding: 'utf8' });
  const lines = errors.split('\n');
  const parsed = [];

  for (const line of lines) {
    const match = line.match(/^([^(]+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (match && parsed.length < BATCH_SIZE) {
      const [_, file, lineNum, col, code, message] = match;
      
      // Skip generated files
      if (file.includes('.svelte-kit') || file.includes('node_modules')) continue;
      
      // Read the actual code line
      let codeLine = '';
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        codeLine = lines[parseInt(lineNum) - 1] || '';
      } catch (e) {
        continue;
      }

      parsed.push({
        file,
        line: lineNum,
        col,
        code,
        error: message,
        codeLine: codeLine.trim()
      });
    }
  }

  console.log(`✅ Found ${parsed.length} errors to process\n`);
  return parsed;
}

// Generate AI fix suggestions
async function generateFixSuggestions(errors) {
  console.log('🤖 Generating AI fix suggestions...\n');
  
  const suggestions = [];
  let processed = 0;

  for (const error of errors) {
    processed++;
    process.stdout.write(`\r   Processing ${processed}/${errors.length}...`);

    const suggestion = await getAIFixSuggestion({
      file: error.file,
      line: error.line,
      code: error.codeLine,
      error: `${error.code}: ${error.error}`
    });

    if (suggestion && suggestion !== error.codeLine) {
      suggestions.push({
        ...error,
        suggestion,
        confidence: suggestion.length > 0 && suggestion.length < 500 ? 'high' : 'low'
      });
    }

    // Rate limit: 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n\n✅ Generated ${suggestions.length} fix suggestions\n`);
  return suggestions;
}

// Create review markdown
function createReviewFile(suggestions) {
  const logsDir = path.resolve('logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const reviewPath = path.join(logsDir, 'ai-fixes-review.md');
  
  let markdown = `# AI-Generated Fix Suggestions\n\n`;
  markdown += `**Generated**: ${new Date().toISOString()}\n`;
  markdown += `**Model**: ${MODEL}\n`;
  markdown += `**Total suggestions**: ${suggestions.length}\n\n`;
  markdown += `---\n\n`;

  suggestions.forEach((sug, index) => {
    markdown += `## Fix ${index + 1}: ${sug.file}:${sug.line}\n\n`;
    markdown += `**Error**: ${sug.code} - ${sug.error}\n\n`;
    markdown += `**Confidence**: ${sug.confidence}\n\n`;
    markdown += `### Current Code\n\`\`\`typescript\n${sug.codeLine}\n\`\`\`\n\n`;
    markdown += `### AI Suggestion\n\`\`\`typescript\n${sug.suggestion}\n\`\`\`\n\n`;
    markdown += `**Action**: [ ] Approve [ ] Reject [ ] Modify\n\n`;
    markdown += `---\n\n`;
  });

  fs.writeFileSync(reviewPath, markdown);
  console.log(`📝 Review file created: ${reviewPath}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Open ${reviewPath}`);
  console.log(`   2. Review each suggestion`);
  console.log(`   3. Mark [x] for approved fixes`);
  console.log(`   4. Run: node ai-assisted-fixer.cjs --apply\n`);
  
  return reviewPath;
}

// Apply approved fixes
async function applyFixes(reviewPath) {
  console.log(`📋 Reading review file: ${reviewPath}\n`);
  
  const content = fs.readFileSync(reviewPath, 'utf8');
  const sections = content.split('---\n');
  
  let applied = 0;
  let skipped = 0;

  for (const section of sections) {
    // Check if approved
    if (section.includes('[x] Approve') || section.includes('[X] Approve')) {
      // Extract file, line, and suggestion
      const fileMatch = section.match(/## Fix \d+: (.+):(\d+)/);
      const currentMatch = section.match(/### Current Code\n```typescript\n(.+?)\n```/s);
      const sugMatch = section.match(/### AI Suggestion\n```typescript\n(.+?)\n```/s);

      if (fileMatch && currentMatch && sugMatch) {
        const [_, file, line] = fileMatch;
        const current = currentMatch[1].trim();
        const suggestion = sugMatch[1].trim();

        try {
          const fileContent = fs.readFileSync(file, 'utf8');
          const lines = fileContent.split('\n');
          
          // Replace the line
          lines[parseInt(line) - 1] = suggestion;
          
          fs.writeFileSync(file, lines.join('\n'));
          applied++;
          console.log(`✅ Applied fix to ${file}:${line}`);
        } catch (error) {
          console.log(`❌ Failed to apply fix to ${file}:${line} - ${error.message}`);
          skipped++;
        }
      }
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   • Applied: ${applied} fixes`);
  console.log(`   • Skipped: ${skipped} fixes\n`);
  
  if (applied > 0) {
    console.log(`✅ Fixes applied! Run TypeScript compiler to verify:\n`);
    console.log(`   npx tsc --noEmit --skipLibCheck\n`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--apply')) {
    // Apply fixes from review file
    const reviewPath = path.join('logs', 'ai-fixes-review.md');
    if (fs.existsSync(reviewPath)) {
      await applyFixes(reviewPath);
    } else {
      console.log(`❌ Review file not found: ${reviewPath}`);
      console.log(`   Run without --apply first to generate suggestions\n`);
    }
    return;
  }

  // Generate suggestions
  const ollamaOk = await checkOllama();
  if (!ollamaOk) return;

  const errors = parseTypeScriptErrors();
  if (errors.length === 0) {
    console.log('🎉 No errors found!\n');
    return;
  }

  const suggestions = await generateFixSuggestions(errors);
  if (suggestions.length === 0) {
    console.log('⚠️  No fix suggestions generated\n');
    return;
  }

  createReviewFile(suggestions);
}

main().catch(console.error);
