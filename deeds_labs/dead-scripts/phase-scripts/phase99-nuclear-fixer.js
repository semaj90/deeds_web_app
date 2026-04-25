
import fs from 'fs';

// Files to check (or scan dir)
const targetFiles = [
    'src/lib/services/ollamaService.ts',
    'src/lib/services/revolutionary-ai-integration.ts',
    'src/lib/vite/vscode-error-logger.ts',
    'src/lib/polyfills/sveltekit2-universal-polyfill.ts'
];

function fixContent(content) {
    let fixed = content;

    // Fix garbage pattern sequences first
    // Escape ? \ etc in regex
    fixed = fixed.replace(/\?:??\?\.\\11111/g, '?.');
    fixed = fixed.replace(/\?\?\?\?\?\.\\11111/g, '?.');
    fixed = fixed.replace(/\?:??\.\\1111/g, '?.');
    fixed = fixed.replace(/\?\?\?\?\?\.\\1111/g, '?.');
    fixed = fixed.replace(/\\11111/g, '');
    fixed = fixed.replace(/\\1111/g, '');

    // Fix "word;char" -> "wordchar"
    fixed = fixed.replace(/(\w);(\w)\b/g, '$1$2');

    // Fix "const var; =" -> "const var ="
    fixed = fixed.replace(/(\w);\s*=/g, '$1 =');

    // Fix "keyword;"
    fixed = fixed.replace(/\b(import|from|type|const|let|var|function|class|interface|return|await|async|throw|new);/g, '$1');

    // Fix ";:" -> ":"
    fixed = fixed.replace(/;\s*:/g, ':');
    // Fix ";=" -> "="
    fixed = fixed.replace(/;\s*=/g, '=');
    // Fix ";)" -> ")"
    fixed = fixed.replace(/;\s*\)/g, ')');
    // Fix ";," -> ","
    fixed = fixed.replace(/;\s*,/g, ',');

    // Fix $1 aliases

    // Fix "baseUr" -> "baseUrl"
    fixed = fixed.replace(/baseUr;/g, 'baseUrl');
    fixed = fixed.replace(/baseUr\b/g, 'baseUrl');

    // Fix "embedMode;$1" -> "embedMode: " (Before strict $1 replacement)
    fixed = fixed.replace(/;\$1/g, ': ');

    // Generic $1 replacements
    fixed = fixed.replace(/\$1/g, ': '); // Default to colon
    fixed = fixed.replace(/\$2/g, ' ');  // Default to space?

    // Fix "import type { redis: ensure" -> "import type { redis, ensure"
    fixed = fixed.replace(/import type {([^}]+)}/g, (match, body) => {
        return 'import type {' + body.replace(/:/g, ',') + '}';
    });

    // Fix "? ?mod" -> "? mod"
    fixed = fixed.replace(/\? \?(\w+)/g, '? $1');

    // Fix "nul;l"
    fixed = fixed.replace(/nul;l/g, 'null');

    // Fix "process;" -> "process"
    fixed = fixed.replace(/process;/g, 'process');

    // Fix "window;" -> "window"
    fixed = fixed.replace(/window;/g, 'window');

    // Fix "env;?" -> "env?"
    fixed = fixed.replace(/env;\?/g, 'env?');

    return fixed;
}const file = process.argv[2];
if (file && fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const fixed = fixContent(content);
    console.log(fixed);
} else {
    console.log("Usage: node scripts/phase99-nuclear-fixer.js <file>");
}
