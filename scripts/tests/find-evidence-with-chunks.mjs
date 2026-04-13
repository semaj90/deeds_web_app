#!/usr/bin/env node

const response = await fetch('http://localhost:5173/api/evidence?limit=100');
const data = await response.json();

const withChunks = (data.evidence || []).filter(e =>
  e.metadata?.chunks && e.metadata.chunks.length > 0
);

console.log(`\n📊 Found ${withChunks.length} evidence items with chunks:\n`);

withChunks.slice(0, 10).forEach((e, i) => {
  const chunkCount = e.metadata.chunks?.length || 0;
  const title = e.title || e.fileName || 'Untitled';
  console.log(`${i + 1}. ${e.id}`);
  console.log(`   Title: ${title}`);
  console.log(`   Chunks: ${chunkCount}`);
  console.log(`   Type: ${e.evidenceType || e.type || 'unknown'}`);
  console.log('');
});

if (withChunks.length > 0) {
  console.log(`\n✅ Use this evidence ID to view chunks:`);
  console.log(`http://localhost:5173/evidence/${withChunks[0].id}\n`);
} else {
  console.log(`\n⚠️  No evidence with chunks found. Upload and process a document first.\n`);
}
