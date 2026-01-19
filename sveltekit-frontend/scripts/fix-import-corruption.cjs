const fs = require('fs');
const path = require('path');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.ts') || file.endsWith('.svelte')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

async function fixImportCorruption() {
    const files = getAllFiles('src');
    let fixedCount = 0;

    for (const filePath of files) {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        // Fix: import: { named } from: 'module'; -> import { named } from 'module';
        // Regex handles multiline imports somewhat safely, but optimized for single line corruption
        if (content.match(/import:\s*\{/)) {
            const newContent = content.replace(/import:\s*(\{.+?\})\s*from:\s*(['"][^'"]+['"])/g, 'import $1 from $2');
            if (newContent !== content) {
                content = newContent;
                modified = true;
            }
        }

        // Fix: import: default from: 'module'; -> import default from 'module';
        if (content.match(/import:\s*\w+\s*from:/)) {
             const newContent = content.replace(/import:\s*(\w+)\s*from:\s*(['"][^'"]+['"])/g, 'import $1 from $2');
             if (newContent !== content) {
                 content = newContent;
                 modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(filePath, content);
            console.log(`Fixed imports in: ${filePath}`);
            fixedCount++;
        }
    }

    console.log(`\nFixed imports in ${fixedCount} files.`);
}

fixImportCorruption().catch(console.error);
