// scripts/phase85-round5-fix.mjs
import fs from 'node:fs';

const files = [
  {
    path: 'src/lib/server/ai/vector-search-service.ts',
    fix: (content) => {
      // Fix: merged.set(result.id, { ...result, similarity: result.similarity * vectorWeight });
      return content.replace(
        /merged\.set\(result\.id,\s*\{\s*\.\.\.result,\s*similarity:\s*result\.similarity\s*\*\s*vectorWeight\s*\}\);/g,
        "merged.set(result.id, Object.assign({}, result, { similarity: result.similarity * vectorWeight }));"
      );
    }
  },
  {
    path: 'src/lib/services/enhanced-rag-pipeline.ts',
    fix: (content) => {
      // Fix: id: row.document_id, row.content, title: row.title, ... citation: row.citation, 1 - (Number(row.distance) || 0),
      // Target: id: row.document_id, content: row.content, title: row.title, ... citation: row.citation, similarity: 1 - (Number(row.distance) || 0),
      return content.replace(
        /id:\s*row\.document_id,\s*row\.content,\s*title:/g,
        "id: row.document_id, content: row.content, title:"
      ).replace(
        /citation:\s*row\.citation,\s*1\s*-\s*\(Number\(row\.distance\)\s*\|\|\s*0\),/g,
        "citation: row.citation, similarity: 1 - (Number(row.distance) || 0),"
      );
    }
  },
  {
    path: 'src/lib/services/minio-gpu-cache-integration.ts',
    fix: (content) => {
      // Fix: const cacheObject: CacheObject = { key, data: finalData, ... }
      // Potentially weird char issue or strict parsing. Rewriting block with explicit syntax.
      if (content.includes('const cacheObject: CacheObject = {')) {
        return content.replace(
            /const\s+cacheObject:\s+CacheObject\s*=\s*\{\s*key,\s*data:\s*finalData,/g,
            "const cacheObject: CacheObject = { key: keyType, data: finalData,"
        ).replace(
            // Fallback if 'key' variable name matches but shorthand fails
            /const\s+cacheObject:\s+CacheObject\s*=\s*\{\s*key,\s*data:\s*finalData,/g,
            "const cacheObject: CacheObject = { key: key, data: finalData,"
        );
      }
      return content;
    }
  }
];

files.forEach(({ path, fix }) => {
  if (fs.existsSync(path)) {
    const original = fs.readFileSync(path, 'utf8');
    const fixed = fix(original);
    if (original !== fixed) {
      fs.writeFileSync(path, fixed, 'utf8');
      console.log(`✅ Fixed verified patterns in ${path}`);
    } else {
      console.log(`⚠️ No patterns matched in ${path} (or already fixed)`);
       // Debug dump for manual check if needed
       // console.log(original.substring(original.indexOf('merged.set'), original.indexOf('merged.set') + 100));
    }
  } else {
    console.log(`❌ File not found: ${path}`);
  }
});
