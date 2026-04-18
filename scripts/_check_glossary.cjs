const fs = require('fs'), path = require('path');
const targets = [
  'purposely','knowingly','recklessly','negligently',
  'but-for','NESS test','loss of chance','market share liability',
  'mailbox rule','mirror image rule','battle of forms','UCC 2-207',
  'jus cogens','erga omnes','VCLT','universality principle',
  'plenary power','trust responsibility','ICWA','sovereign immunity',
  'aggravating','mitigating','departure','3A1','5K'
];
let allTerms = [];
for (let i = 1; i <= 9; i++) {
  const fp = path.join(__dirname, 'glossary_batch_' + i + '.cjs');
  if (fs.existsSync(fp)) { const m = require(fp); allTerms = allTerms.concat(m.terms || []); }
}
console.log('Total terms in batch files:', allTerms.length);
console.log('\n--- Searching batch files for target terms ---');
for (const t of targets) {
  const tl = t.toLowerCase();
  const found = allTerms.filter(row => row[0].toLowerCase().includes(tl) || row[1].toLowerCase().includes(tl));
  if (found.length > 0) {
    console.log('FOUND  "' + t + '" in: ' + found.map(f => f[0]).join(', '));
  } else {
    console.log('MISSING "' + t + '"');
  }
}
