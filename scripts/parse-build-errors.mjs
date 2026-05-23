import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve('build_errors.log');
const OUTPUT_JSON = path.resolve('build_errors.json');

// Regex patterns for MSVC / Linker / NVCC errors and warnings
const msvcPattern = /^(.+?)\((\d+),?(\d*)\):\s+(warning|error|fatal error)\s+([A-Z0-9]+):\s+(.+?)(?:\s+\[(.+?)\])?$/i;
const linkerPattern = /^(.+?)\s*:\s+(fatal error|error|warning)\s+([A-Z0-9]+):\s+(.+?)(?:\s+\[(.+?)\])?$/i;
const gccPattern = /^(.+?):(\d+):(\d*):\s+(warning|error|fatal error):\s+(.+)$/i;
const nvccPattern = /^(.+?)\((\d+)\):\s+(warning|error|fatal error):\s+(.+)$/i;

const compilingSourcePattern = /^\(compiling source file\s+'(.+?)'\)$/i;

function parseLog() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error(`Log file not found: ${LOG_FILE}`);
    process.exit(1);
  }

  const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
  const lines = logContent.split(/\r?\n/);
  const parsedItems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let match = line.match(compilingSourcePattern);
    if (match) {
      if (parsedItems.length > 0) {
        parsedItems[parsedItems.length - 1].compiledSource = match[1].trim();
      }
      continue;
    }

    match = line.match(msvcPattern);
    if (match) {
      parsedItems.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: match[3] ? parseInt(match[3], 10) : null,
        severity: match[4].toLowerCase(),
        code: match[5].toUpperCase(),
        message: match[6].trim(),
        project: match[7] ? match[7].trim() : null,
        compiledSource: null,
        raw: line
      });
      continue;
    }

    match = line.match(linkerPattern);
    if (match) {
      parsedItems.push({
        file: match[1].trim(),
        line: null,
        column: null,
        severity: match[2].toLowerCase(),
        code: match[3].toUpperCase(),
        message: match[4].trim(),
        project: match[5] ? match[5].trim() : null,
        compiledSource: null,
        raw: line
      });
      continue;
    }

    match = line.match(gccPattern);
    if (match) {
      parsedItems.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: match[3] ? parseInt(match[3], 10) : null,
        severity: match[4].toLowerCase(),
        code: 'GCC_ERR',
        message: match[5].trim(),
        project: null,
        compiledSource: null,
        raw: line
      });
      continue;
    }

    match = line.match(nvccPattern);
    if (match) {
      parsedItems.push({
        file: match[1].trim(),
        line: parseInt(match[2], 10),
        column: null,
        severity: match[3].toLowerCase(),
        code: 'NVCC_ERR',
        message: match[4].trim(),
        project: null,
        compiledSource: null,
        raw: line
      });
      continue;
    }
  }

  // Merge adjacent/continuation lines for the same diagnostic item
  const uniqueItems = [];
  for (const item of parsedItems) {
    if (uniqueItems.length > 0) {
      const prev = uniqueItems[uniqueItems.length - 1];
      if (prev.file === item.file && prev.line === item.line && prev.code === item.code && prev.severity === item.severity) {
        prev.message += '\n             ' + item.message;
        prev.raw += '\n' + item.raw;
        if (item.compiledSource && !prev.compiledSource) {
          prev.compiledSource = item.compiledSource;
        }
        continue;
      }
    }
    uniqueItems.push(item);
  }

  console.log(`Parsed ${parsedItems.length} total entries, found ${uniqueItems.length} unique occurrences.`);
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(uniqueItems, null, 2), 'utf-8');
  console.log(`Successfully wrote unique items to ${OUTPUT_JSON}`);

  generateSummary(uniqueItems);
}

function generateSummary(items) {
  // Aggregate stats
  const severityCounts = { error: 0, warning: 0, 'fatal error': 0 };
  const codeCounts = {};
  const fileCounts = {};

  for (const item of items) {
    const sev = item.severity;
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;

    const code = item.code;
    codeCounts[code] = (codeCounts[code] || 0) + 1;

    const baseFile = path.basename(item.file);
    fileCounts[baseFile] = (fileCounts[baseFile] || 0) + 1;
  }

  // Print Summary Header
  console.log('\n=========================================');
  console.log('         BUILD DIAGNOSTICS REPORT        ');
  console.log('=========================================');
  console.log(`Errors:   ${(severityCounts['error'] || 0) + (severityCounts['fatal error'] || 0)}`);
  console.log(`Warnings: ${severityCounts['warning'] || 0}`);
  console.log('-----------------------------------------');

  console.log('\nTop Error/Warning Codes:');
  Object.entries(codeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([code, count]) => {
      console.log(`  - ${code}: ${count} occurrences`);
    });

  console.log('\nTop Affected Files:');
  Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([file, count]) => {
      console.log(`  - ${file}: ${count} occurrences`);
    });

  console.log('\nTop 100 Unique Issues:');
  // Sort items: Errors first, then warnings. Within those, sort by file path then line.
  const sortedItems = [...items].sort((a, b) => {
    const isErrorA = a.severity.includes('error') ? 1 : 0;
    const isErrorB = b.severity.includes('error') ? 1 : 0;
    if (isErrorA !== isErrorB) return isErrorB - isErrorA;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return (a.line || 0) - (b.line || 0);
  });

  const limit = Math.min(sortedItems.length, 100);
  for (let i = 0; i < limit; i++) {
    const item = sortedItems[i];
    const location = item.line ? `${path.basename(item.file)}:${item.line}:${item.column || 0}` : path.basename(item.file);
    const sourceContext = item.compiledSource ? ` (during compile of ${path.basename(item.compiledSource)})` : '';
    console.log(`[${i + 1}] [${item.severity.toUpperCase()}] [${item.code}] at ${location}${sourceContext}`);
    console.log(`    Message: ${item.message}`);
  }
}

parseLog();
