/**
 * Export Audio Transcription to Multiple Formats
 * Extracts Whisper transcription from evidence metadata and saves as .txt, .json, .md
 */

import { createRequire } from 'module';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const green = '\x1b[32m';
const blue = '\x1b[34m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';

function log(message, color = reset) {
  console.log(`${color}${message}${reset}`);
}

async function getLatestAudioTranscription() {
  log('\n🔍 Fetching Latest Audio Transcription...', blue);

  const result = await pool.query(`
    SELECT
      id,
      file_name,
      title,
      metadata->'transcription' as transcription,
      metadata->'entities' as entities,
      metadata->'aceAnalysis' as ace_analysis,
      metadata->>'processingStatus' as status,
      created_at
    FROM evidence
    WHERE evidence_type = 'audio'
      AND metadata->'transcription' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    log('❌ No audio transcriptions found', yellow);
    return null;
  }

  const row = result.rows[0];
  const transcription = row.transcription;

  log(`✅ Found transcription:`, green);
  log(`  Evidence ID: ${row.id}`, reset);
  log(`  File: ${row.file_name}`, reset);
  log(`  Title: ${row.title}`, reset);
  log(`  Status: ${row.status}`, reset);
  log(`  Created: ${row.created_at}`, reset);

  return {
    evidenceId: row.id,
    fileName: row.file_name,
    title: row.title,
    transcription: transcription,
    entities: row.entities || [],
    aceAnalysis: row.ace_analysis || {},
    status: row.status,
    createdAt: row.created_at
  };
}

async function exportToText(data, outputDir) {
  log('\n📝 Exporting to .txt...', blue);

  const txtContent = `
Audio Transcription Export
===========================

File: ${data.fileName}
Title: ${data.title}
Evidence ID: ${data.evidenceId}
Date: ${data.createdAt}
Status: ${data.status}

Language: ${data.transcription.language || 'Unknown'}
Duration: ${data.transcription.duration || 0} seconds

Transcription:
--------------
${data.transcription.text}

${data.transcription.segments && data.transcription.segments.length > 0 ? `
Segments (${data.transcription.segments.length}):
${data.transcription.segments.map((seg, i) =>
  `[${seg.start?.toFixed(2)}s - ${seg.end?.toFixed(2)}s] ${seg.text}`
).join('\n')}
` : ''}

ACE Analysis:
-------------
Summary: ${data.aceAnalysis.summary || 'N/A'}
Confidence: ${data.aceAnalysis.confidence || 'N/A'}
Tags: ${data.aceAnalysis.tags?.join(', ') || 'None'}

Entities Found: ${data.entities.length}
${data.entities.length > 0 ? data.entities.map(e =>
  `- ${e.type}: "${e.text}" (${e.label || 'N/A'})`
).join('\n') : ''}
`.trim();

  const txtPath = join(outputDir, `transcription-${data.evidenceId}.txt`);
  await writeFile(txtPath, txtContent, 'utf8');

  log(`✅ Saved: ${txtPath}`, green);
  log(`  Size: ${txtContent.length} bytes`, reset);

  return txtPath;
}

async function exportToJson(data, outputDir) {
  log('\n📊 Exporting to .json...', blue);

  const jsonData = {
    evidenceId: data.evidenceId,
    fileName: data.fileName,
    title: data.title,
    status: data.status,
    createdAt: data.createdAt,
    transcription: {
      text: data.transcription.text,
      language: data.transcription.language,
      duration: data.transcription.duration,
      segments: data.transcription.segments || []
    },
    entities: data.entities,
    aceAnalysis: data.aceAnalysis,
    exportedAt: new Date().toISOString(),
    format: 'whisper-transcription-v1'
  };

  const jsonContent = JSON.stringify(jsonData, null, 2);
  const jsonPath = join(outputDir, `transcription-${data.evidenceId}.json`);
  await writeFile(jsonPath, jsonContent, 'utf8');

  log(`✅ Saved: ${jsonPath}`, green);
  log(`  Size: ${jsonContent.length} bytes`, reset);

  return jsonPath;
}

async function exportToMarkdown(data, outputDir) {
  log('\n📄 Exporting to .md...', blue);

  const mdContent = `# Audio Transcription: ${data.title}

## Metadata

| Field | Value |
|-------|-------|
| **File Name** | ${data.fileName} |
| **Evidence ID** | \`${data.evidenceId}\` |
| **Status** | ${data.status} |
| **Created** | ${data.createdAt} |
| **Language** | ${data.transcription.language || 'Unknown'} |
| **Duration** | ${data.transcription.duration || 0}s |

---

## Transcription

${data.transcription.text}

${data.transcription.segments && data.transcription.segments.length > 0 ? `
---

## Timeline (${data.transcription.segments.length} segments)

| Time | Text |
|------|------|
${data.transcription.segments.map(seg =>
  `| ${seg.start?.toFixed(2)}s - ${seg.end?.toFixed(2)}s | ${seg.text.replace(/\|/g, '\\|')} |`
).join('\n')}
` : ''}

---

## ACE Analysis

**Summary:** ${data.aceAnalysis.summary || 'N/A'}

**Confidence:** ${data.aceAnalysis.confidence || 'N/A'}

**Tags:** ${data.aceAnalysis.tags?.map(t => `\`${t}\``).join(', ') || 'None'}

${data.aceAnalysis.claims && data.aceAnalysis.claims.length > 0 ? `
**Claims:**
${data.aceAnalysis.claims.map((claim, i) => `${i + 1}. ${claim}`).join('\n')}
` : ''}

${data.aceAnalysis.contradictions && data.aceAnalysis.contradictions.length > 0 ? `
**Contradictions:**
${data.aceAnalysis.contradictions.map((c, i) => `${i + 1}. ${c}`).join('\n')}
` : ''}

---

## Entities (${data.entities.length})

${data.entities.length > 0 ? `
| Type | Text | Label | Position |
|------|------|-------|----------|
${data.entities.map(e =>
  `| ${e.type} | ${e.text} | ${e.label || 'N/A'} | ${e.start || '?'}-${e.end || '?'} |`
).join('\n')}
` : '_No entities extracted_'}

---

*Exported: ${new Date().toISOString()}*
*Format: Whisper Base Model (Multi-lingual)*
`;

  const mdPath = join(outputDir, `transcription-${data.evidenceId}.md`);
  await writeFile(mdPath, mdContent, 'utf8');

  log(`✅ Saved: ${mdPath}`, green);
  log(`  Size: ${mdContent.length} bytes`, reset);

  return mdPath;
}

async function displaySummary(data) {
  log('\n═══════════════════════════════════════════════════', blue);
  log('   Transcription Summary', blue);
  log('═══════════════════════════════════════════════════', blue);

  log(`\n📁 Source:`, blue);
  log(`  File: ${data.fileName}`, reset);
  log(`  Title: ${data.title}`, reset);

  log(`\n🌍 Language Detection:`, blue);
  log(`  Detected: ${data.transcription.language || 'Unknown'}`, reset);
  log(`  Duration: ${data.transcription.duration || 0}s`, reset);

  log(`\n📝 Transcription:`, blue);
  log(`  Length: ${data.transcription.text?.length || 0} characters`, reset);
  log(`  Segments: ${data.transcription.segments?.length || 0}`, reset);

  if (data.transcription.text) {
    const preview = data.transcription.text.length > 300
      ? data.transcription.text.slice(0, 300) + '...'
      : data.transcription.text;
    log(`\n  Text Preview:`, yellow);
    log(`  "${preview}"`, reset);
  }

  log(`\n🏷️  Analysis:`, blue);
  log(`  Entities: ${data.entities.length}`, reset);
  log(`  ACE Tags: ${data.aceAnalysis.tags?.length || 0}`, reset);
  log(`  ACE Confidence: ${data.aceAnalysis.confidence || 'N/A'}`, reset);

  if (data.aceAnalysis.summary && data.aceAnalysis.summary !== '...') {
    log(`\n  ACE Summary:`, yellow);
    log(`  ${data.aceAnalysis.summary}`, reset);
  }
}

async function main() {
  log('═══════════════════════════════════════════════════', blue);
  log('   Audio Transcription Export Tool', blue);
  log('═══════════════════════════════════════════════════', blue);

  try {
    const data = await getLatestAudioTranscription();
    if (!data) {
      await pool.end();
      return;
    }

    // Create output directory
    const outputDir = 'uploads/transcriptions';
    await mkdir(outputDir, { recursive: true });
    log(`\n📁 Output directory: ${outputDir}`, blue);

    // Export to all formats
    const txtPath = await exportToText(data, outputDir);
    const jsonPath = await exportToJson(data, outputDir);
    const mdPath = await exportToMarkdown(data, outputDir);

    // Display summary
    await displaySummary(data);

    log('\n✅ Export Complete!', green);
    log('\n📦 Files Created:', blue);
    log(`  1. ${txtPath}`, reset);
    log(`  2. ${jsonPath}`, reset);
    log(`  3. ${mdPath}`, reset);

    log('\n🎉 Transcription data is fully accessible and exportable!', green);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
