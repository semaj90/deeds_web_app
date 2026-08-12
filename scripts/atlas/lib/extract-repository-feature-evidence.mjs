#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanPlaceholderPatterns } from './feature-placeholder-regex-model.mjs';
import { fileURLToPath } from 'node:url';

const CODE_EXTENSIONS = new Set(['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','.svelte','.vue','.astro','.py','.go','.rs','.java','.kt','.kts','.scala','.rb','.php','.cs','.fs','.swift','.dart','.c','.cc','.cpp','.cxx','.h','.hpp','.cu','.cuh','.sh','.bash','.zsh','.ps1','.sql','.r','.lua']);

export async function extractRepositoryFeatureEvidence(filePath, options = {}) {
  const absolute = path.resolve(filePath);
  const extension = path.extname(absolute).toLowerCase();
  const content = await fs.readFile(absolute, 'utf8');
  const modality = detectModality(extension, content);
  const common = {
    schema_version: 'atlas.repository-feature-evidence.v1',
    source_ref: options.sourceRef ?? absolute,
    modality,
    language: detectLanguage(extension),
    placeholders: scanPlaceholderPatterns(content),
    semantic_tokens: collectSemanticTokens(content),
  };

  if (modality === 'code') return { ...common, ast_evidence: extractCodeFallbackEvidence(content, extension, absolute), document_evidence: extractEmbeddedDocumentation(content) };
  if (modality === 'html' || modality === 'xml') return { ...common, document_evidence: extractHtmlEvidence(content) };
  if (modality === 'markdown') return { ...common, document_evidence: extractMarkdownEvidence(content) };
  if (modality === 'json') return { ...common, document_evidence: extractJsonEvidence(content) };
  return { ...common, document_evidence: extractPlainTextEvidence(content) };
}

export function extractCodeFallbackEvidence(content, extension, filePath = '') {
  const exportedSymbols = unique([
    ...captureAll(content, /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g),
    ...captureAll(content, /\b(?:public\s+)?(?:class|struct|trait|interface|enum|def|fn|func)\s+([A-Za-z_$][\w$]*)/g),
  ]);
  const routeMethods = unique(captureAll(content, /\bexport\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g));
  const componentImports = unique(captureAll(content, /\bimport\s+([A-Z][A-Za-z0-9_$]*)\s+from\s+["'][^"']+["']/g));
  const visibleHeadings = ['.svelte','.vue','.astro','.html','.htm'].includes(extension)
    ? unique(captureAll(content, /<h[1-3][^>]*>([^<]{3,120})<\/h[1-3]>/gi))
    : [];
  return {
    schema_version: 'atlas.ast-feature-evidence.v1',
    language: detectLanguage(extension),
    exportedSymbols,
    routeMethods,
    componentImports,
    declaredTypes: unique(captureAll(content, /\b(?:interface|type|class|enum|struct|trait)\s+([A-Za-z_$][\w$]*)/g)),
    callableNames: unique(captureAll(content, /\b(?:function|def|fn|func)\s+([A-Za-z_$][\w$]*)/g)),
    visibleHeadings,
    semanticTokens: collectSemanticTokens(content),
    parseErrorCount: 0,
    primaryFunctionalSymbol: visibleHeadings[0] ?? exportedSymbols.find((v) => !isGenericSymbol(v)) ?? componentImports.find((v) => !isGenericSymbol(v)) ?? null,
    extractionMode: 'regex-fallback',
    filePath,
  };
}

function extractHtmlEvidence(content) {
  return { modality: 'html', title: firstCapture(content, /<title[^>]*>([^<]{1,160})<\/title>/i), headings: unique(captureAll(content, /<h[1-6][^>]*>([^<]{2,160})<\/h[1-6]>/gi)), altText: unique(captureAll(content, /\balt=["']([^"']{2,200})["']/gi)), captions: unique(captureAll(content, /<(?:figcaption|caption)[^>]*>([^<]{2,200})<\/(?:figcaption|caption)>/gi)), nounPhrases: [], keywords: [], entities: [] };
}
function extractMarkdownEvidence(content) {
  const headings = unique(captureAll(content, /^#{1,6}\s+(.{2,160})$/gm));
  return { modality: 'markdown', title: headings[0] ?? null, headings, altText: unique(captureAll(content, /!\[([^\]]{2,200})\]\([^)]+\)/g)), captions: [], nounPhrases: [], keywords: collectSemanticTokens(content).slice(0,32), entities: [] };
}
function extractPlainTextEvidence(content) {
  const lines = content.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  return { modality: 'text', title: lines.find((v) => v.length >= 3 && v.length <= 120) ?? null, headings: lines.filter((v) => v.length <= 100 && /^[A-Z0-9][^.!?]*$/.test(v)).slice(0,16), altText: [], captions: [], nounPhrases: [], keywords: collectSemanticTokens(content).slice(0,32), entities: [] };
}
function extractJsonEvidence(content) {
  try {
    const value = JSON.parse(content); const texts = []; walkJson(value, texts);
    return { modality: 'json', title: findNamedString(value, ['title','name','label','feature_label']), headings: [], altText: [], captions: [], nounPhrases: [], keywords: unique(texts.flatMap(collectSemanticTokens)).slice(0,64), entities: [] };
  } catch { return extractPlainTextEvidence(content); }
}
function extractEmbeddedDocumentation(content) {
  return { modality: 'code_documentation', title: firstCapture(content, /@fileoverview\s+([^\n*]+)/i), headings: unique(captureAll(content, /^\s*\/\/\s*#{1,6}\s+(.+)$/gm)), altText: [], captions: [], nounPhrases: [], keywords: collectSemanticTokens(unique(captureAll(content, /\/\*\*([\s\S]*?)\*\//g)).join(' ')).slice(0,32), entities: [] };
}
function detectModality(ext, content) { if (CODE_EXTENSIONS.has(ext)) return 'code'; if (['.html','.htm'].includes(ext)) return 'html'; if (['.xml','.svg'].includes(ext)) return 'xml'; if (['.md','.mdx','.markdown'].includes(ext)) return 'markdown'; if (['.json','.jsonl'].includes(ext)) return 'json'; if (/^\s*<!doctype html|<html[\s>]/i.test(content)) return 'html'; return 'text'; }
function detectLanguage(ext) { return ({'.ts':'typescript','.tsx':'tsx','.mts':'typescript','.cts':'typescript','.js':'javascript','.jsx':'jsx','.mjs':'javascript','.cjs':'javascript','.svelte':'svelte','.vue':'vue','.astro':'astro','.py':'python','.go':'go','.rs':'rust','.java':'java','.kt':'kotlin','.kts':'kotlin','.scala':'scala','.rb':'ruby','.php':'php','.cs':'csharp','.fs':'fsharp','.swift':'swift','.dart':'dart','.c':'c','.cc':'cpp','.cpp':'cpp','.cxx':'cpp','.h':'c','.hpp':'cpp','.cu':'cuda','.cuh':'cuda','.sql':'sql','.sh':'shell','.bash':'shell','.zsh':'shell','.ps1':'powershell','.r':'r','.lua':'lua'})[ext] ?? 'unknown'; }
function collectSemanticTokens(text) { const stop = new Set(['this','that','with','from','into','then','than','have','will','your','their','there','where','which','while','using','used','code','file','function','class','module','const','return']); const matches = String(text ?? '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []; const counts = new Map(); for (const token of matches) { const n = token.replace(/[_-]+/g,' '); if (!stop.has(n)) counts.set(n,(counts.get(n) ?? 0)+1); } return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,64).map(([token])=>token); }
function captureAll(text, regex) { const out=[]; let m; while ((m=regex.exec(text))!==null) { if (m[1]) out.push(stripTags(m[1]).trim()); if (!regex.global) break; } return out.filter(Boolean); }
function firstCapture(text, regex) { const m=text.match(regex); return m?.[1] ? stripTags(m[1]).trim() : null; }
function stripTags(value) { return String(value).replace(/<[^>]+>/g,' ').replace(/\s+/g,' '); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function isGenericSymbol(value) { return /^(?:page|server|layout|index|handler|component|main|default)$/i.test(value); }
function walkJson(value,out) { if (typeof value==='string') out.push(value); else if (Array.isArray(value)) for (const item of value) walkJson(item,out); else if (value && typeof value==='object') for (const item of Object.values(value)) walkJson(item,out); }
function findNamedString(value,names) { if (!value || typeof value!=='object') return null; for (const name of names) if (typeof value[name]==='string') return value[name]; return null; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node extract-repository-feature-evidence.mjs <file>'); process.exit(2); }
  extractRepositoryFeatureEvidence(filePath).then((result)=>console.log(JSON.stringify(result,null,2))).catch((error)=>{ console.error(error); process.exit(1); });
}
