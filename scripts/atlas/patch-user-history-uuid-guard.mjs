import fs from 'node:fs';

const filePath = 'sveltekit-frontend/src/lib/server/ml/user-history.ts';
let code = fs.readFileSync(filePath, 'utf8');

const helper = `
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toValidUuidOrNull(val: unknown): string | null {
	if (typeof val === 'string' && UUID_REGEX.test(val)) {
		return val;
	}
	return null;
}
`;

if (!code.includes('UUID_REGEX')) {
	code = code.replace("import { v4 as uuidv4 } from 'uuid';", "import { v4 as uuidv4 } from 'uuid';" + helper);
}

// Ensure recordView guards documentId & caseId
const oldRecordView = `\tdocumentId: string,\r\n\t\tcaseId: string,\r\n\t\tdurationSeconds: number,\r\n\t\tsearchContext?: string,\r\n\t\tinferredTopics?: Array<{ topicId: number; affinity: number }>\r\n\t): Promise<void> {\r\n\t\ttry {\r\n\t\t\tawait db.insert(userInteractionHistory).values({\r\n\t\t\t\tid: uuidv4(),\r\n\t\t\t\tuserId: Number(this.userId),\r\n\t\t\t\tdocumentId,\r\n\t\t\t\tcaseId,`;

const newRecordView = `\tdocumentId: string,\r\n\t\tcaseId: string,\r\n\t\tdurationSeconds: number,\r\n\t\tsearchContext?: string,\r\n\t\tinferredTopics?: Array<{ topicId: number; affinity: number }>,\r\n\t\textraMetadata?: Record<string, unknown>\r\n\t): Promise<void> {\r\n\t\ttry {\r\n\t\t\tconst validDocId = toValidUuidOrNull(documentId);\r\n\t\t\tconst validCaseId = toValidUuidOrNull(caseId);\r\n\t\t\tconst meta: Record<string, unknown> = {\r\n\t\t\t\tsource: 'document_detail_panel',\r\n\t\t\t\tviewTimeMs: durationSeconds * 1000,\r\n\t\t\t\t...(extraMetadata || {})\r\n\t\t\t};\r\n\t\t\tif (!validDocId && documentId) meta.rawDocumentId = documentId;\r\n\t\t\tif (!validCaseId && caseId) meta.rawCaseId = caseId;\r\n\t\t\tawait db.insert(userInteractionHistory).values({\r\n\t\t\t\tid: uuidv4(),\r\n\t\t\t\tuserId: Number(this.userId),\r\n\t\t\t\tdocumentId: validDocId,\r\n\t\t\t\tcaseId: validCaseId,`;

// Fallback for LF
const oldRecordViewLF = oldRecordView.replace(/\r\n/g, '\n');
const newRecordViewLF = newRecordView.replace(/\r\n/g, '\n');

if (code.includes(oldRecordView)) {
	code = code.replace(oldRecordView, newRecordView);
} else if (code.includes(oldRecordViewLF)) {
	code = code.replace(oldRecordViewLF, newRecordViewLF);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully patched user-history.ts with UUID guard');
