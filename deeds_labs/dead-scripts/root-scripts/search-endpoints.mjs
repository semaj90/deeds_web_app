import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

function searchFiles(dir, patterns, results = []) {
  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git') && !item.includes('.svelte-kit')) {
          searchFiles(fullPath, patterns, results);
        } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.svelte') || item.endsWith('.js') || item.endsWith('.json'))) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const relativePath = path.relative(process.cwd(), fullPath);

            patterns.forEach(pattern => {
              const regex = new RegExp(pattern, 'gi');
              const lines = content.split('\n');

              lines.forEach((line, index) => {
                if (regex.test(line)) {
                  results.push({
                    pattern,
                    file: relativePath,
                    line: index + 1,
                    content: line.trim()
                  });
                }
              });
            });
          } catch (e) {
            // Skip files that can't be read
          }
        }
      } catch (e) {
        // Skip items that can't be accessed
      }
    }
  } catch (e) {
    // Skip directories that can't be read
  }

  return results;
}

const patterns = ['minio', 'MINIO_URL', 'minioClient', 'uploadFile', 'http://localhost:9000', 'http://localhost:4002', 's3Key', 'bucket', '/api/v1/rag', '/api/v1/files', 'RAGService', 'MinIOService', 'qdrant', 'ollama', 'embedding'];

console.log('🔎 Searching for MinIO and RAG endpoints...');
const results = searchFiles(process.cwd(), patterns);
console.log(`Found ${results.length} matches across ${new Set(results.map(r => r.file)).size} files`);

console.log('\nTop matches:');
results.slice(0, 30).forEach(r => {
  console.log(`${r.file}:${r.line}: ${r.content}`);
});

fs.writeFileSync('minio_endpoints.json', JSON.stringify(results, null, 2));
console.log('\n📄 Results exported to: minio_endpoints.json');