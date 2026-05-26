import fs from 'fs';
import path from 'path';
import readline from 'readline';

export async function queryProgress(query) {
    const logPath = path.resolve('docs/ai-os/agentic-progress-log.ndjson');
    if (!fs.existsSync(logPath)) return [];
    
    const results = [];
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line);
        if (JSON.stringify(entry).toLowerCase().includes(query.toLowerCase())) {
            results.push(entry);
        }
    }
    return results;
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
    const query = process.argv[2] || '';
    queryProgress(query).then(res => console.log(JSON.stringify(res, null, 2)));
}
