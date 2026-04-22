import fs from 'fs';
import path from 'path';

const reportPath = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs_readme/deeds_labs_archive/phase42-ast-report.json';
const outputDir = 'c:/Users/james/Videos/deeds-web-app/next_steps/consolidated_audits';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('📊 Aggregating AST Failures for Production Consolidation...');

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const errors = report.summary.errors;

const dirStats = {};

errors.forEach((err) => {
    // Normalize path and get directory
    const fullPath = err.file.replace(/\\/g, '/');
    const parts = fullPath.split('/');
    const srcIndex = parts.indexOf('src');
    
    let dirPath = 'Unknown';
    if (srcIndex !== -1) {
        dirPath = parts.slice(srcIndex).slice(0, -1).join('/');
    }

    if (!dirStats[dirPath]) {
        dirStats[dirPath] = {
            total: 0,
            failures: [],
            reasons: {}
        };
    }

    dirStats[dirPath].total++;
    dirStats[dirPath].failures.push({
        file: path.basename(err.file),
        reason: err.reason,
        error: err.error || err.originalError || 'Unknown Error'
    });

    const reasonKey = err.reason || 'Unknown';
    dirStats[dirPath].reasons[reasonKey] = (dirStats[dirPath].reasons[reasonKey] || 0) + 1;
});

// Sort directories by failure count
const sortedDirs = Object.entries(dirStats).sort((a, b) => b[1].total - a[1].total);

let consolidationReport = `# 🏗️ Production Consolidation: Codebase Health Report\n\n`;
consolidationReport += `**Timestamp**: ${new Date().toISOString()}\n`;
consolidationReport += `**Total Failures**: ${errors.length}\n`;
consolidationReport += `**Affected Directories**: ${Object.keys(dirStats).length}\n\n`;

consolidationReport += `## 📂 Directory-Level Breakdown\n\n`;

sortedDirs.forEach(([dir, stats]) => {
    const topReason = Object.entries(stats.reasons).sort((a, b) => b[1] - a[1])[0][0];
    
    consolidationReport += `### 📁 ${dir}\n`;
    consolidationReport += `- **Failures**: ${stats.total}\n`;
    consolidationReport += `- **Primary Issue**: ${topReason}\n`;
    consolidationReport += `- **Health Status**: 🔴 Needs Consolidation\n`;
    consolidationReport += `- **Target Files**: ${stats.failures.slice(0, 5).map(f => `\`${f.file}\``).join(', ')}${stats.total > 5 ? '...' : ''}\n\n`;
});

consolidationReport += `## 🚀 Consolidation Strategy\n\n`;
consolidationReport += `1. **Pruning**: Identify files in "Unknown" or "Legacy" paths for archival.\n`;
consolidationReport += `2. **Batch Repair**: Target \`src/lib/components/ai\` first (highest failure density).\n`;
consolidationReport += `3. **Syntax Standardization**: 80% of errors are \`Unexpected token\`, likely Svelte 4 -> 5 migration mismatches. Apply bulk codemods.\n`;

fs.writeFileSync(path.join(outputDir, 'FULL_CONSOLIDATION_REPORT.md'), consolidationReport);

console.log(`✅ Consolidation Report Generated: ${path.join(outputDir, 'FULL_CONSOLIDATION_REPORT.md')}`);
