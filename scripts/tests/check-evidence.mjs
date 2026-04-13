const evidenceId = '2f57918a-3ee0-4234-8ee4-ffd9bee20673';
const response = await fetch(`http://localhost:5173/api/evidence/${evidenceId}`);
const data = await response.json();
const e = data.evidence || data;

console.log('\n📄 Evidence Details:\n');
console.log('Title:', e.title || e.fileName || 'Untitled');
console.log('Type:', e.evidenceType || e.type);
console.log('File:', e.fileName);
console.log('\n📊 Processing Status:\n');
console.log('Has metadata:', !!e.metadata);
console.log('Has chunks:', !!(e.metadata?.chunks));
console.log('Chunk count:', e.metadata?.chunks?.length || 0);
console.log('Has extractedText:', !!(e.metadata?.extractedText));
console.log('Text length:', (e.metadata?.extractedText || '').length);
console.log('Has gpuAnalysis:', !!(e.metadata?.gpuAnalysis));

if (e.metadata?.chunks && e.metadata.chunks.length > 0) {
  console.log('\n✅ CHUNKS FOUND!\n');
  e.metadata.chunks.slice(0, 3).forEach((chunk, i) => {
    console.log(`Chunk ${i + 1}:`);
    console.log(`  Type: ${chunk.type}`);
    console.log(`  Text: ${(chunk.text || '').substring(0, 80)}...`);
  });
} else {
  console.log('\n⚠️  No chunks generated yet');
  console.log('Metadata:', JSON.stringify(e.metadata, null, 2));
}
