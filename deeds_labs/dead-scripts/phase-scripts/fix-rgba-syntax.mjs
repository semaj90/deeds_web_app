import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../src');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
}

const files = getAllFiles(rootDir).filter(file => file.endsWith('.svelte') || file.endsWith('.css'));

let fixedCount = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Regex to find rgba(a, b, c: d) and replace with rgba(a, b, c, d)
  // Be careful not to replace things that look like object keys but are inside rgba
  // The pattern we saw is "rgba(r, g, b: a)"

  const regex = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*:\s*([0-9.]+)\s*\)/g;

  if (regex.test(content)) {
    console.log(`Fixing ${file}`);
    const newContent = content.replace(regex, 'rgba($1, $2, $3, $4)');
    fs.writeFileSync(file, newContent, 'utf8');
    fixedCount++;
  }
});

console.log(`Fixed rgba syntax in ${fixedCount} files.`);
