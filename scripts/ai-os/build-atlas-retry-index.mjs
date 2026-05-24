import fs from 'fs';
import path from 'path';

export function buildAtlasRetryIndex() {
    const logPath = path.resolve('docs/ai-os/agentic-progress-log.ndjson');
    const indexPath = path.resolve('docs/ai-os/atlas-retry-index.json');
    
    if (!fs.existsSync(logPath)) return;
    
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const retryPlans = [];
    
    for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.type === 'error' || entry.type === 'retry') {
            retryPlans.push(entry);
        }
    }
    
    fs.writeFileSync(indexPath, JSON.stringify({ failedFeatures: retryPlans, retryPlans }, null, 2));
    console.log(`Rebuilt retry index with ${retryPlans.length} items`);
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
    buildAtlasRetryIndex();
}
