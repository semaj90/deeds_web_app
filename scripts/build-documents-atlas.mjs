import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import readline from 'readline';
import crypto from 'crypto';
import { extractLogSignals, summarizeLog } from "./atlas/extract-log-signals.mjs";
import { indexAtlasCard } from "./atlas/index-atlas-card.mjs";
import { cacheFailure } from "./cache/log-failure-pattern.mjs";

dotenv.config();

async function gemmaClient(prompt) {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GEMMA4_MODEL || 'gemma4-legal-iq4xs-direct.gguf',
        prompt: prompt,
        stream: false,
        format: 'json'
      })
    });
    if (res.ok) {
      const data = await res.json();
      try {
        return JSON.parse(data.response);
      } catch {
        return data.response;
      }
    }
  } catch (err) {
    console.warn(`[warning] gemmaClient invocation failed:`, err.message);
  }
  return null;
}

// Target folders and root directory configurations
const rootDir = process.cwd().replace(/\\/g, '/');

// --- HELPER FUNCTIONS FOR SIGNAL EXTRACTION & ARCHIVING ---

async function archiveLargeFile(filePath, hash, size) {
  const archiveDir = path.join(rootDir, 'archive', 'logs');
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
  const baseName = path.basename(filePath);
  const hashPrefix = hash.replace('sha256:', '').substring(0, 8);
  const destPath = path.join(archiveDir, `${hashPrefix}_${baseName}`);
  fs.copyFileSync(filePath, destPath);
  fs.unlinkSync(filePath);
  return destPath;
}

function isLogFile(filePath) {
  const nameLower = path.basename(filePath).toLowerCase();
  return nameLower.includes('log') || nameLower.includes('trace') || nameLower.includes('audit') || nameLower.endsWith('.log') || nameLower.includes('failed') || nameLower.includes('results');
}

function getDocType(filePath, content) {
  const nameLower = path.basename(filePath).toLowerCase();
  const contentLower = content.toLowerCase();
  
  if (nameLower.endsWith('.md') && !nameLower.includes('log') && !nameLower.includes('audit')) {
    return 'docs';
  }
  if (nameLower.includes('log') || nameLower.includes('audit') || nameLower.endsWith('.log') || contentLower.includes('error') || contentLower.includes('exception')) {
    return 'log';
  }
  return 'notes';
}

function relevanceScore(doc) {
  let score = 0;

  if (doc.type === "docs") score += 3;
  if (doc.type === "log") score += 1;

  if (/feature|api|schema/i.test(doc.content)) score += 3;
  if (/error|fail/i.test(doc.content)) score += 1;

  return score;
}



const recursiveDirs = [
  path.join(rootDir, 'docs'),
  path.join(rootDir, 'llm'),
  path.join(rootDir, 'scripts'),
  path.join(rootDir, 'sveltekit-frontend', 'documents')
].map(p => p.replace(/\\/g, '/'));

// Folders to skip entirely during recursive scans
const skipFolders = new Set([
  'node_modules', '.git', '.cache', '.svelte-kit', '.venv', '.vs', 'vendor', 'backups', 'minio-data', '.tmp', 'playwright-report'
]);

// Maximum file size to index (5 MB) to avoid loading massive raw dumps/logs
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Vocabulary for deterministic tag extraction
const vocabulary = [
  'pgvector', 'simd', 'drizzle', 'svelte', 'mcp', 'cuda', 'bifrost', 'qdrant',
  'neo4j', 'redis', 'autoencoder', 'webgpu', 'sharedarraybuffer', 'rabbitmq',
  'pg18', 'aio', 'tensor', 'glop', 'reranker', 'langextract', 'docker',
  'sentry', 'ast', 'langgraph', 'ace', 'som'
];

// Standard English stop words to exclude from keyword search/index
const stopWords = new Set([
  'the', 'and', 'a', 'to', 'of', 'in', 'is', 'it', 'that', 'for', 'on', 'with', 'as', 'this', 'are', 'by', 'an', 'be', 'at', 'or', 'from', 'was', 'but', 'not', 'your', 'you', 'we', 'our', 'will', 'can', 'has', 'have', 'been', 'about', 'how', 'out', 'all', 'any', 'into', 'only', 'than', 'them', 'then', 'there', 'their', 'they', 'who', 'what', 'which', 'when', 'where', 'why', 'here', 'its', 'these', 'those', 'also', 'more', 'some', 'would', 'should', 'could', 'other', 'over', 'such', 'after', 'before', 'been', 'were', 'does', 'doing', 'done', 'did', 'has', 'had', 'having', 'about', 'above', 'below', 'under', 'between', 'during', 'through'
]);

// Strip markdown formatting for a clean summary
function cleanSummary(text) {
  if (!text) return '';
  // Strip markdown headings
  let clean = text.replace(/^#+\s+/gm, '');
  // Strip code blocks
  clean = clean.replace(/```[\s\S]*?```/g, '');
  // Strip inline code backticks
  clean = clean.replace(/`([^`]+)`/g, '$1');
  // Strip markdown links [text](url) -> text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Strip bold/italic markup
  clean = clean.replace(/[\*_]{1,3}([^*_]+)[\*_]{1,3}/g, '$1');
  // Strip blockquotes and list markers
  clean = clean.replace(/^\s*[-*+]\s+/gm, '');
  clean = clean.replace(/^\s*>\s+/gm, '');
  // Normalize whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  // Truncate to 300 characters
  if (clean.length > 300) {
    clean = clean.slice(0, 297) + '...';
  }
  return clean;
}

// Generate file url in format file:///c:/path/to/file
function getFileUrl(absPath) {
  const norm = absPath.replace(/\\/g, '/');
  // Lowercase the drive letter if exists
  if (/^[A-Za-z]:/.test(norm)) {
    return 'file:///' + norm.charAt(0).toLowerCase() + norm.slice(1);
  }
  return 'file://' + norm;
}

// Normalize language names
function normalizeLanguage(lang) {
  const map = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'cpp': 'c++',
    'cc': 'c++',
    'cxx': 'c++',
    'h': 'c++',
    'hpp': 'c++',
    'sh': 'shell',
    'bash': 'shell',
    'ps1': 'powershell',
    'sql': 'sql',
    'svelte': 'svelte',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'yml': 'yaml',
    'yaml': 'yaml',
    'docker': 'dockerfile',
    'dockerfile': 'dockerfile',
    'rust': 'rust',
    'rs': 'rust'
  };
  return map[lang] || lang;
}

// Detect programming languages in a document
function detectLanguages(content) {
  const langs = new Set();
  
  // 1. Check code blocks in markdown
  const codeBlockRegex = /```([a-zA-Z0-9_\-#\+]+)/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const lang = match[1].toLowerCase();
    if (lang && lang !== 'text' && lang !== 'plain' && lang !== 'none') {
      langs.add(normalizeLanguage(lang));
    }
  }

  // 2. Heuristics on content
  const contentLower = content.toLowerCase();
  if (content.includes('import {') || content.includes('import * as') || (content.includes('const ') && content.includes('=>')) || (content.includes('function ') && content.includes('{'))) {
    if (content.includes(': string') || content.includes(': number') || content.includes('interface ') || (content.includes('type ') && content.includes('='))) {
      langs.add('typescript');
    } else {
      langs.add('javascript');
    }
  }
  if (content.includes('def ') && (content.includes('import ') || content.includes('print('))) {
    langs.add('python');
  }
  if (content.includes('#include ') || content.includes('std::') || content.includes('void main(')) {
    langs.add('c++');
  }
  if (content.includes('SELECT ') || content.includes('INSERT INTO') || content.includes('CREATE TABLE') || content.includes('drizzle-orm') || content.includes('pgTable(')) {
    langs.add('sql');
  }
  if (content.includes('$state') || content.includes('$derived') || content.includes('$props') || content.includes('onMount') || content.includes('<script')) {
    langs.add('svelte');
  }
  if (contentLower.includes('dockerfile') || content.includes('FROM ') || content.includes('RUN apt-get')) {
    langs.add('dockerfile');
  }
  if (content.includes('version: "3') || content.includes('services:') || contentLower.includes('docker-compose')) {
    langs.add('docker-compose');
  }
  if (content.includes('import torch') || content.includes('LibTorch') || content.includes('cudaEvent_t') || content.includes('cudaEventRecord') || content.includes('nvcc ')) {
    langs.add('cuda');
  }

  return Array.from(langs);
}

// Extract AST Path Mapping relations (files and code symbols referenced in the text)
function extractAstRelations(content) {
  const files = new Set();
  const symbols = new Set();

  // Find file path references in text
  const filePathRegex = /\b(?:src|scripts|docs|simd-bridge|drizzle|services|sveltekit-frontend)\/[a-zA-Z0-9_\-\.\/]+\b/g;
  let match;
  while ((match = filePathRegex.exec(content)) !== null) {
    files.add(match[0]);
  }

  // Find code symbols in backticks
  const symbolRegex = /`([a-zA-Z0-9_\$]{4,50})`/g;
  while ((match = symbolRegex.exec(content)) !== null) {
    const sym = match[1];
    // skip common keywords and formatting
    if (!sym.includes('.') && !/^(true|false|null|undefined|const|let|var|function|import|export|class|interface|type)$/.test(sym)) {
      symbols.add(sym);
    }
  }

  return {
    referencedFiles: Array.from(files),
    referencedSymbols: Array.from(symbols)
  };
}

// Classify file into ripgrep search groups (domains/verticals)
function getRgGroups(relativePath, content, category) {
  const groups = new Set();
  const contentLower = content.toLowerCase();
  const pathLower = relativePath.toLowerCase();

  // Database
  if (contentLower.includes('drizzle') || contentLower.includes('postgres') || contentLower.includes('pgtable') || contentLower.includes('migration') || contentLower.includes('sql') || pathLower.includes('db') || pathLower.includes('schema')) {
    groups.add('db-drizzle-postgres');
  }

  // ML / CUDA
  if (contentLower.includes('cuda') || contentLower.includes('torch') || contentLower.includes('gemma') || contentLower.includes('bifrost') || contentLower.includes('ollama') || contentLower.includes('autoencoder') || contentLower.includes('som') || contentLower.includes('xgboost') || pathLower.includes('cuda') || pathLower.includes('bifrost')) {
    groups.add('ml-inference-cuda');
  }

  // Svelte / Frontend
  if (contentLower.includes('svelte') || contentLower.includes('runes') || contentLower.includes('bits-ui') || contentLower.includes('superform') || contentLower.includes('playwright') || pathLower.includes('sveltekit') || pathLower.includes('frontend')) {
    groups.add('web-svelte-frontend');
  }

  // RAG / Vector
  if (contentLower.includes('qdrant') || contentLower.includes('neo4j') || contentLower.includes('couchdb') || contentLower.includes('duckdb') || contentLower.includes('rag') || contentLower.includes('vector') || contentLower.includes('centroid') || contentLower.includes('kmeans') || pathLower.includes('qdrant') || pathLower.includes('neo4j')) {
    groups.add('rag-vector-search');
  }

  // Caching
  if (contentLower.includes('redis') || contentLower.includes('cache') || contentLower.includes('semantic') || pathLower.includes('cache') || pathLower.includes('redis')) {
    groups.add('caching-redis');
  }

  // Infrastructure / DevOps
  if (contentLower.includes('docker') || contentLower.includes('compose') || contentLower.includes('rabbitmq') || contentLower.includes('seaweed') || contentLower.includes('nginx') || contentLower.includes('sentry') || pathLower.includes('docker') || pathLower.includes('nginx')) {
    groups.add('infra-devops');
  }

  // Logs & Timelines
  if (category === 'session-log' || category === 'todo-list' || pathLower.includes('timeline') || pathLower.includes('todo') || pathLower.includes('checklist')) {
    groups.add('logs-timelines');
  }

  if (groups.size === 0) {
    groups.add('uncategorized');
  }

  return Array.from(groups);
}

// Find all target .md and .txt files
const filesToProcess = [];

// 1. Files directly in the root directory (non-recursive)
try {
  const rootItems = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const item of rootItems) {
    if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        filesToProcess.push(path.join(rootDir, item.name).replace(/\\/g, '/'));
      }
    }
  }
} catch (err) {
  console.error(`Error listing workspace root: ${err.message}`);
}

// 2. Recursive directories walk
function walkDir(dir) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name).replace(/\\/g, '/');
      if (item.isDirectory()) {
        if (!skipFolders.has(item.name)) {
          walkDir(fullPath);
        }
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (ext === '.md' || ext === '.txt') {
          filesToProcess.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error(`Error walking directory ${dir}: ${err.message}`);
  }
}

for (const dir of recursiveDirs) {
  if (fs.existsSync(dir)) {
    walkDir(dir);
  }
}

console.log(`Discovered ${filesToProcess.length} document files. Starting index generation...`);

const documents = Object.create(null);
const invertedIndex = Object.create(null);

let skippedCount = 0;

for (const filePath of filesToProcess) {
  try {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const absolutePath = filePath;
    const fileUrl = getFileUrl(absolutePath);
    const stats = fs.statSync(filePath);
    
    let content = '';
    let isLarge = false;
    let reduced = null;

    // Check file size safety
    if (stats.size > MAX_FILE_SIZE) {
      if (/error|log|trace|svelte|tsc/i.test(filePath)) {
        console.log(`[atlas] compressing log: ${filePath}`);
        const reduced = extractLogSignals(filePath);
        const summary = await summarizeLog(gemmaClient, reduced);
        if (summary) {
          let summaryObj = summary;
          if (typeof summary === 'string') {
            try {
              const jsonMatch = summary.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                summaryObj = JSON.parse(jsonMatch[0]);
              } else {
                summaryObj = JSON.parse(summary);
              }
            } catch {
              summaryObj = { patterns: [summary], modules: [], rootCauses: [] };
            }
          }

          await indexAtlasCard({
            type: "log_summary",
            file: filePath,
            summary: summaryObj,
          });

          // Hook into extractor: cache failure patterns
          if (summaryObj && summaryObj.patterns && Array.isArray(summaryObj.patterns)) {
            for (const p of summaryObj.patterns) {
              await cacheFailure(p);
            }
          }
        }

        // Archive raw log
        const hash = 'sha256:' + crypto.createHash('sha256').update(reduced).digest('hex');
        const archivedPath = await archiveLargeFile(filePath, hash, stats.size);
        console.log(`[atlas] archived raw log to: ${archivedPath}`);

        // Register document metadata card
        documents[relativePath] = {
          title: `Signal Card: ${path.basename(filePath)}`,
          relativePath,
          absolutePath,
          fileUrl,
          size: stats.size,
          lines: reduced.split(/\r?\n/).length,
          lastModified: stats.mtime.toISOString(),
          headings: [],
          category: 'audit-report',
          tags: ['log_summary'],
          summary: summary ? JSON.stringify(summary) : 'Log signal summary',
          languages: [],
          astRelations: { referencedFiles: [], referencedSymbols: [] },
          rgGroups: ['archive'],
          isSummarizedOnly: true,
          archive: {
            path: path.relative(rootDir, archivedPath).replace(/\\/g, '/'),
            hash,
            size: (stats.size / 1024 / 1024).toFixed(2) + 'MB',
            indexed: true,
            summaryRef: fileUrl
          }
        };

        // Tokenize summary for searchability
        const tokensText = `${path.basename(filePath)} ${summary ? JSON.stringify(summary) : ''}`.toLowerCase();
        const tokens = tokensText.match(/[a-z0-9]+/g) || [];
        const uniqueTokens = new Set(
          tokens
            .filter(t => t.length >= 3 && t.length <= 25 && !stopWords.has(t) && !/^\d+$/.test(t))
        );
        for (const token of uniqueTokens) {
          if (!invertedIndex[token]) {
            invertedIndex[token] = [];
          }
          invertedIndex[token].push(relativePath);
        }

        continue;
      } else {
        console.log(`[atlas] skipping large non-log file: ${filePath}`);
        skippedCount++;
        continue;
      }
    } else {
      content = fs.readFileSync(filePath, 'utf-8');
    }

    // Determine document type and calculate relevance score
    const docType = getDocType(filePath, content);
    const score = relevanceScore({ type: docType, content });

    // Archive raw logs and files with low relevance (score < 2)
    if (score < 2) {
      console.log(`Archiving low-relevance file ${relativePath} (score: ${score})...`);
      const hash = isLarge && reduced ? reduced.hash : ('sha256:' + crypto.createHash('sha256').update(content).digest('hex'));
      const archivedPath = await archiveLargeFile(filePath, hash, stats.size);
      
      const archiveMeta = {
        path: path.relative(rootDir, archivedPath).replace(/\\/g, '/'),
        hash,
        size: (stats.size / 1024 / 1024).toFixed(2) + 'MB',
        indexed: false,
        summaryRef: fileUrl
      };

      documents[relativePath] = {
        title: path.basename(filePath),
        relativePath,
        absolutePath,
        fileUrl,
        size: stats.size,
        lines: isLarge && reduced ? reduced.lineCount : content.split(/\r?\n/).length,
        lastModified: stats.mtime.toISOString(),
        headings: [],
        category: 'archive-metadata',
        tags: [],
        summary: `Archived log metadata: ${JSON.stringify(archiveMeta)}`,
        languages: [],
        astRelations: { referencedFiles: [], referencedSymbols: [] },
        rgGroups: ['archive'],
        isSummarizedOnly: true,
        archive: archiveMeta
      };
      
      // We skip content indexing/tokenizing for archived files
      continue;
    }

    // For large log files, archive the raw file and index the summary
    let archiveMeta = null;
    if (isLarge && reduced) {
      const archivedPath = await archiveLargeFile(filePath, reduced.hash, stats.size);
      archiveMeta = {
        path: path.relative(rootDir, archivedPath).replace(/\\/g, '/'),
        hash: reduced.hash,
        size: (stats.size / 1024 / 1024).toFixed(2) + 'MB',
        indexed: true,
        summaryRef: fileUrl
      };
    }

    const isSummarizedOnly = (score >= 2 && score <= 3) || isLarge;

    const lines = content.split(/\r?\n/);
    const lineCount = isLarge && reduced ? reduced.lineCount : lines.length;

    // Extract Title
    let title = path.basename(filePath);
    if (isLarge && reduced) {
      title = reduced.title;
    } else {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          title = trimmed.replace(/^#+\s*/, '').trim();
          break;
        } else if (trimmed.length > 0 && title === path.basename(filePath)) {
          title = trimmed;
        }
      }
    }

    // Extract Headings (skip for large summarized files as they represent log samples)
    const headings = [];
    if (!isLarge) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          const match = trimmed.match(/^(#+)\s+(.*)$/);
          if (match) {
            headings.push({
              level: match[1].length,
              text: match[2].trim()
            });
          }
        }
      }
    }

    // Categorization
    let category = 'reference';
    if (isLarge) {
      category = 'audit-report';
    } else {
      const nameLower = path.basename(filePath).toLowerCase();
      const pathLower = relativePath.toLowerCase();
      if (nameLower.includes('session') || nameLower.includes('timeline') || nameLower.includes('loop') || /\d+[-_]\d+[-_]\d+/.test(nameLower)) {
        category = 'session-log';
      } else if (nameLower.includes('todo') || nameLower.includes('checklist') || nameLower.includes('task') || nameLower.includes('action')) {
        category = 'todo-list';
      } else if (nameLower.includes('audit') || nameLower.includes('report') || nameLower.includes('analysis') || nameLower.includes('check') || nameLower.includes('findings') || nameLower.includes('error') || nameLower.includes('failed') || nameLower.includes('results')) {
        category = 'audit-report';
      } else if (nameLower.includes('architecture') || nameLower.includes('guide') || nameLower.includes('spec') || nameLower.includes('plan') || nameLower.includes('design') || nameLower.includes('wiring') || nameLower.includes('setup') || nameLower.includes('installation') || nameLower.includes('matrix') || nameLower.includes('blueprint') || nameLower.includes('readme') || nameLower.includes('llms') || nameLower.includes('llm')) {
        category = 'design-doc';
      }
    }

    // Extract vocabulary-based tags
    const contentLower = content.toLowerCase();
    const tags = vocabulary.filter(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      return regex.test(contentLower);
    });

    // Clean summary
    const summary = isLarge && reduced ? reduced.summary : cleanSummary(content);

    // Programming Languages Detected
    const languages = isLarge ? [] : detectLanguages(content);

    // AST path mapping relations
    const astRelations = extractAstRelations(content);

    // Ripgrep Search groups
    const rgGroups = getRgGroups(relativePath, content, category);

    // Save document metadata
    documents[relativePath] = {
      title,
      relativePath,
      absolutePath,
      fileUrl,
      size: stats.size,
      lines: lineCount,
      lastModified: stats.mtime.toISOString(),
      headings,
      category,
      tags,
      summary,
      languages,
      astRelations,
      rgGroups,
      isSummarizedOnly,
      archive: archiveMeta
    };

    // Tokenize text and build inverted index (tokenize summary only if summarized index is requested)
    const textToTokenize = isSummarizedOnly
      ? `${title} ${summary} ${headings.map(h => h.text).join(' ')}`.toLowerCase()
      : `${title} ${summary} ${headings.map(h => h.text).join(' ')} ${content}`.toLowerCase();
      
    const tokens = textToTokenize.match(/[a-z0-9]+/g) || [];
    const uniqueTokens = new Set(
      tokens
        .filter(t => t.length >= 3 && t.length <= 25 && !stopWords.has(t) && !/^\d+$/.test(t))
    );

    for (const token of uniqueTokens) {
      if (!invertedIndex[token]) {
        invertedIndex[token] = [];
      }
      invertedIndex[token].push(relativePath);
    }
  } catch (err) {
    console.error(`Error processing file ${filePath}: ${err.message}`);
  }
}

// Transform to AtlasCards and enforce Phase 9 CI Assertions
function buildAtlasCard(file) {
  const searchTerms = file.tags && file.tags.length > 0 ? file.tags : (file.rgGroups || ['uncategorized']);
  const card = {
    id: file.archive && file.archive.hash ? file.archive.hash : crypto.createHash('sha256').update(file.absolutePath).digest('hex').substring(0, 8),
    title: file.title,
    path: file.relativePath,
    fileUrl: file.fileUrl,
    sizeBytes: file.size,
    lines: file.lines,
    modifiedAt: file.lastModified,

    searchGroups: file.rgGroups || ['uncategorized'],
    clusterTags: file.tags || [],
    topoClass: file.category,

    summary: file.summary,
    structure: file.headings ? file.headings.map(h => h.text) : [],

    sourceRefs: [`${file.relativePath}:L1-L${file.lines}`],
    commands: [
      `rg -n "${searchTerms.join('|')}" ${file.relativePath}`
    ],
    // Keep languages and archive metadata for Postgres/Internal logic
    languages: file.languages,
    archive: file.archive
  };

  // CI Assertions (Phase 9 Rules)
  if (!card.path) throw new Error(`Invalid Atlas Card: Missing path for ${file.title}`);
  if (!card.searchGroups || card.searchGroups.length === 0) throw new Error(`Invalid Atlas Card: Missing searchGroups for ${file.title}`);
  if (!card.sourceRefs || card.sourceRefs.length === 0) throw new Error(`Invalid Atlas Card: Missing sourceRefs for ${file.title}`);
  if (!card.commands || card.commands.length === 0) throw new Error(`Invalid Atlas Card: Missing commands for ${file.title}`);

  return card;
}

const finalDocuments = Object.create(null);
for (const [key, doc] of Object.entries(documents)) {
  try {
    finalDocuments[key] = buildAtlasCard(doc);
  } catch (err) {
    console.warn(`[CI Failure] Skipping ${key}: ${err.message}`);
  }
}

// Compile canonical JSON structure
const indexData = {
  generatedAt: new Date().toISOString(),
  totalDocuments: Object.keys(finalDocuments).length,
  skippedCount,
  documents: finalDocuments,
  invertedIndex
};

// Write docs/documents-atlas-index.json
const outputJsonPath = path.join(rootDir, 'docs', 'documents-atlas-index.json');
const memoryJsonPath = path.join(rootDir, 'memory', 'atlas', 'documents-atlas.inverted.json');
try {
  fs.writeFileSync(outputJsonPath, JSON.stringify(indexData, null, 2), 'utf-8');
  console.log(`Successfully wrote canonical index JSON: ${outputJsonPath}`);

  fs.mkdirSync(path.dirname(memoryJsonPath), { recursive: true });
  fs.writeFileSync(memoryJsonPath, JSON.stringify(indexData.invertedIndex, null, 2), 'utf-8');
  console.log(`Successfully wrote inverted index JSON: ${memoryJsonPath}`);
} catch (err) {
  console.error(`Failed to write JSON index: ${err.message}`);
}

// Build beautiful markdown report docs/documents-atlas-index.md
const categories = ['session-log', 'design-doc', 'todo-list', 'audit-report', 'reference'];
const categoryLabels = {
  'session-log': '📅 Session Logs & Timelines',
  'design-doc': '📐 Architectural Plans & Design Documents',
  'todo-list': '📋 Checklists & Todo Lists',
  'audit-report': '🔍 Audits, Reports & Hardening Logs',
  'reference': '📖 General Reference Guides'
};

let md = `# Documents Master Atlas Index\n\n`;
md += `*Generated at: ${indexData.generatedAt} | Total Documents Indexed: ${indexData.totalDocuments} | Skipped (too large): ${skippedCount}*\n\n`;
md += `This document serves as the master catalog of indexed documents inside the deeds web app repository, linking structural context directly to absolute source references for token-efficient retrieval.\n\n`;

for (const cat of categories) {
  const catDocs = Object.values(finalDocuments).filter(d => d.topoClass === cat);
  if (catDocs.length === 0) continue;

  md += `## ${categoryLabels[cat]}\n\n`;
  
  for (const doc of catDocs) {
    const sizeKB = (doc.sizeBytes / 1024).toFixed(2);
    md += `### 📄 [${doc.title}](${doc.fileUrl})\n`;
    md += "```json\n" + JSON.stringify(doc, null, 2) + "\n```\n\n";
  }
  md += `\n`;
}

const outputMdPath = path.join(rootDir, 'docs', 'documents-atlas-index.md');
const memoryMdPath = path.join(rootDir, 'memory', 'atlas', 'documents-atlas.latest.md');
try {
  fs.writeFileSync(outputMdPath, md, 'utf-8');
  console.log(`Successfully wrote markdown report catalog: ${outputMdPath}`);

  fs.mkdirSync(path.dirname(memoryMdPath), { recursive: true });
  fs.writeFileSync(memoryMdPath, md, 'utf-8');
  console.log(`Successfully wrote latest markdown catalog: ${memoryMdPath}`);
} catch (err) {
  console.error(`Failed to write Markdown report: ${err.message}`);
}

async function saveToPostgres(docs) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("⚠️ DATABASE_URL is not set, skipping database upserts.");
    return;
  }

  console.log("💾 Connecting to Postgres to upsert documents atlas...");
  const pool = new pg.Pool({ connectionString: dbUrl });

  const sanitize = (str) => typeof str === 'string' ? str.replace(/\0/g, '') : str;

  try {
    const docList = Object.values(docs);
    console.log(`Upserting ${docList.length} documents into 'documents_atlas_entries'...`);

    const query = `
      INSERT INTO documents_atlas_entries (
        source_ref, path, title, category, summary, tags, keywords, protocols, libraries, languages, feature_families, headings, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (source_ref) DO UPDATE SET
        path = EXCLUDED.path,
        title = EXCLUDED.title,
        category = EXCLUDED.category,
        summary = EXCLUDED.summary,
        tags = EXCLUDED.tags,
        keywords = EXCLUDED.keywords,
        protocols = EXCLUDED.protocols,
        libraries = EXCLUDED.libraries,
        languages = EXCLUDED.languages,
        feature_families = EXCLUDED.feature_families,
        headings = EXCLUDED.headings,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    `;

    for (const doc of docList) {
      await pool.query(query, [
        sanitize(doc.fileUrl), // source_ref
        sanitize(doc.path), // path
        sanitize(doc.title),
        sanitize(doc.topoClass), // category
        sanitize(doc.summary),
        sanitize(JSON.stringify(doc.clusterTags || [])),
        sanitize(JSON.stringify([])), // keywords
        sanitize(JSON.stringify([])), // protocols
        sanitize(JSON.stringify([])), // libraries
        sanitize(JSON.stringify(doc.languages || [])),
        sanitize(JSON.stringify(doc.searchGroups || [])), // feature_families
        sanitize(JSON.stringify(doc.structure || [])),
        sanitize(JSON.stringify({
          sizeBytes: doc.sizeBytes,
          lines: doc.lines,
          lastModified: doc.modifiedAt,
          sourceRefs: doc.sourceRefs,
          commands: doc.commands,
          archive: doc.archive || null
        }))
      ]);
    }

    console.log("✅ Successfully upserted all documents into Postgres.");
  } catch (err) {
    console.error("❌ Failed to save documents to Postgres:", err);
  } finally {
    await pool.end();
  }
}

await saveToPostgres(finalDocuments);
process.exit(0);

