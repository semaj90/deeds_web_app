import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const INPUT_PATH = path.resolve(ROOT_DIR, 'memory/graph/deep-node-relations.jsonl');

async function main() {
    if (!fs.existsSync(INPUT_PATH)) {
        console.error('No relations file found');
        return;
    }
    const content = await fs.promises.readFile(INPUT_PATH, 'utf8');
    const relations = content.split('\n').filter(Boolean).map(line => JSON.parse(line));
    
    const dynamicImports = relations.filter(r => r.relation_type === 'imports_dynamic');
    console.log(`Found ${dynamicImports.length} dynamic imports.`);
    
    const reportPath = path.resolve(ROOT_DIR, 'docs/reports/dynamic-import-report.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    
    let md = `# Dynamic Imports Report\n\n`;
    for (const d of dynamicImports) {
        md += `- From: ${d.from || d.source} -> To: ${d.to || d.target}\n`;
    }
    await fs.promises.writeFile(reportPath, md, 'utf8');
    console.log(`Saved report to ${reportPath}`);
}
main().catch(console.error);
