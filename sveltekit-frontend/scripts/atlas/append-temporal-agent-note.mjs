import fs from 'fs';
import path from 'path';

console.log('🚀 Temporal Agent Note Appender Starting');

const workspaceRoot = 'c:/Users/james/Videos/deeds-web-app';
const agentsMdPath = path.join(workspaceRoot, 'AGENTS.md');
const llmsMdPath = path.join(workspaceRoot, 'sveltekit-frontend/scripts/atlas/llms.md');

const isDryRun = process.argv.includes('--dry-run');

// Extract arguments
const noteArgIdx = process.argv.indexOf('--note');
const noteContent = noteArgIdx !== -1 && process.argv[noteArgIdx + 1]
  ? process.argv[noteArgIdx + 1]
  : `Auto-generated temporal append test note at ${new Date().toISOString()}`;

const appendId = `append-${Date.now()}`;
const timestamp = new Date().toISOString();

const formattedNote = `
<!-- ATLAS_TEMPORAL_APPEND_START id=${appendId} time=${timestamp} -->
### Temporal Event Note [${timestamp}]
${noteContent}
<!-- ATLAS_TEMPORAL_APPEND_END id=${appendId} -->
`;

function appendToTarget(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`[Appender] Target ${filePath} does not exist. Creating default file...`);
    if (!isDryRun) {
      fs.writeFileSync(filePath, `# Temporal Logs\n`);
    }
  }

  if (isDryRun) {
    console.log(`[Appender] [DRY RUN] Would append to ${filePath}:\n${formattedNote}`);
  } else {
    fs.appendFileSync(filePath, formattedNote);
    console.log(`[Appender] Successfully appended note ${appendId} to ${filePath}`);
  }
}

appendToTarget(agentsMdPath);
appendToTarget(llmsMdPath);
