import fs from 'node:fs';

const cardMap = JSON.parse(fs.readFileSync('memory/exports/sourceRef-cardId-map.json', 'utf8'));
const keys = Object.keys(cardMap);
console.log('Total Card Map Keys:', keys.length);
console.log('Sample Card Map Keys:', keys.slice(0, 20));

const packets = fs.readFileSync('.tmp/addressable-packets.validated.ndjson', 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);

console.log('\nTotal Packets:', packets.length);
console.log('Sample Packet source_refs:', packets.slice(0, 20).map(p => p.source_ref));

// Let's check for any intersection
let matchCount = 0;
const cardMapKeysSet = new Set(keys.map(k => k.replace(/\\/g, '/').toLowerCase()));
for (const p of packets) {
  const ref = (p.source_ref || '').replace(/\\/g, '/').toLowerCase();
  if (cardMapKeysSet.has(ref)) {
    matchCount++;
  }
}
console.log('\nExact Matches between packet source_ref and card map keys:', matchCount);
