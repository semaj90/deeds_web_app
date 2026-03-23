import { readFileSync, existsSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts;
const dead = [];

for (const [name, cmd] of Object.entries(scripts)) {
  // Find file references in node/tsx/npx commands
  const patterns = [
    /(?:node|tsx)\s+(?:\.\/)?([^\s;|&"']+\.(?:mjs|mts|ts|js|py))/g,
    /python\s+(?:\.\/)?([^\s;|&"']+\.py)/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(cmd)) !== null) {
      const file = m[1];
      if (!existsSync(file) && !existsSync('./' + file) && !existsSync('../' + file)) {
        dead.push({ name, file });
      }
    }
  }
}

console.log('Dead npm script references (file does not exist):');
console.log('='.repeat(60));
for (const d of dead) {
  console.log(`  "${d.name}" -> ${d.file}`);
}
console.log(`\nTotal: ${dead.length} dead references`);
