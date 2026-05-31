const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if(!file){
  console.error('Usage: node check-jsonl-lines.cjs <file>');
  process.exit(2);
}
console.log('Checking', file);
const stream = fs.createReadStream(file, { encoding: 'utf8' });
let rem = '';
let lineNo = 0;
stream.on('data', chunk => {
  rem += chunk;
  let idx;
  while((idx = rem.indexOf('\n')) >= 0){
    const line = rem.slice(0, idx).trim();
    rem = rem.slice(idx+1);
    lineNo++;
    if(line.length===0) continue;
    try{ JSON.parse(line); }
    catch(e){ console.log('LINE_ERR', lineNo, e.message); }
  }
});
stream.on('end', () => {
  if(rem.trim().length){
    lineNo++;
    try{ JSON.parse(rem); }catch(e){ console.log('LINE_ERR', lineNo, e.message); }
  }
  console.log('Done. Lines checked:', lineNo);
});
