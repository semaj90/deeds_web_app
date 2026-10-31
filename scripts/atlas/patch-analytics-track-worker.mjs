import fs from 'node:fs';

const filePath = 'sveltekit-frontend/src/lib/server/queue/queue-worker.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target = `\t\t\t\tconst tracker = new UserHistoryTracker(userId);\r\n\t\t\t\tconst documentId = (data.payload.documentId ?? data.payload.caseId ?? data.eventType) as string;\r\n\t\t\t\tconst caseId = (data.payload.caseId ?? 'general') as string;\r\n\t\t\t\tawait tracker.recordView(documentId, caseId, 0);`;

const replacement = `\t\t\t\tconst tracker = new UserHistoryTracker(userId);\r\n\t\t\t\tconst documentId = ((data.payload.documentId ?? data.payload.evidenceId) || '') as string;\r\n\t\t\t\tconst caseId = (data.payload.caseId || '') as string;\r\n\t\t\t\tawait tracker.recordView(documentId, caseId, 0, undefined, undefined, { eventType: data.eventType, sourceEvent: data.eventType });`;

const targetLF = target.replace(/\r\n/g, '\n');
const replacementLF = replacement.replace(/\r\n/g, '\n');

if (code.includes(target)) {
	code = code.replace(target, replacement);
} else if (code.includes(targetLF)) {
	code = code.replace(targetLF, replacementLF);
} else {
	console.error('Target not found in queue-worker.ts');
	process.exit(1);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched AnalyticsTrackWorker in queue-worker.ts');
