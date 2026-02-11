const fs = require('fs');
const data = fs.readFileSync(0, 'utf8');
const lines = data.split('\n').filter(Boolean);
const fileErrors = {};
const msgCats = {};
for (const line of lines) {
  const idx = line.indexOf('{"type');
  if (idx < 0) continue;
  try {
    const obj = JSON.parse(line.substring(idx));
    if (obj.type !== 'ERROR') continue;
    const f = obj.filename;
    fileErrors[f] = (fileErrors[f] || 0) + 1;
    let msg = obj.message.substring(0, 60);
    if (msg.includes('no exported member')) msg = 'Module has no exported member';
    else if (msg.includes('Cannot find module')) msg = 'Cannot find module';
    else if (msg.includes('does not exist on type')) msg = 'Property does not exist on type';
    else if (msg.includes('not assignable to type')) msg = 'Type not assignable';
    else if (msg.includes('Unexpected token')) msg = 'Unexpected token (svelte)';
    else if (msg.includes('Unexpected block')) msg = 'Unexpected block closing tag';
    else if (msg.includes('left open')) msg = 'Element left open';
    else if (msg.includes('missing the following')) msg = 'Missing required properties';
    else if (msg.includes('only specify known')) msg = 'Object literal unknown property';
    else if (msg.includes('Expected a valid CSS')) msg = 'CSS parse error';
    else if (msg.includes('invalid_directive')) msg = 'Invalid directive on component';
    else if (msg.includes('attribute_unquoted')) msg = 'Attribute unquoted sequence';
    msgCats[msg] = (msgCats[msg] || 0) + 1;
  } catch (e) {}
}
console.log('=== TOP ERROR CATEGORIES ===');
Object.entries(msgCats).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log(v.toString().padStart(4) + ' | ' + k));
console.log('\n=== TOP 40 FILES ===');
Object.entries(fileErrors).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log(v.toString().padStart(4) + ' | ' + k));
console.log('\nTotal errors:', Object.values(fileErrors).reduce((a, b) => a + b, 0));
console.log('Total files:', Object.keys(fileErrors).length);
