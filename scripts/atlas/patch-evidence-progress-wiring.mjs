import fs from 'node:fs';

// 1. Patch schema.ts MAX_FILE_SIZE to 100MB
const schemaPath = 'sveltekit-frontend/src/routes/(app)/evidence/schema.ts';
let schemaCode = fs.readFileSync(schemaPath, 'utf8');
schemaCode = schemaCode.replace(
	'const MAX_FILE_SIZE = 50 * 1024 * 1024;',
	'const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (aligned with /api/evidence/upload)'
);
fs.writeFileSync(schemaPath, schemaCode, 'utf8');
console.log('schema.ts updated MAX_FILE_SIZE to 100MB');

// 2. Patch +page.server.ts to create and return jobId
const pageServerPath = 'sveltekit-frontend/src/routes/(app)/evidence/+page.server.ts';
let pageServerCode = fs.readFileSync(pageServerPath, 'utf8');

if (!pageServerCode.includes('createJob')) {
	pageServerCode = pageServerCode.replace(
		"import { dispatchOrExecuteInline } from '$lib/server/queue/dispatch-inline.js';",
		"import { dispatchOrExecuteInline } from '$lib/server/queue/dispatch-inline.js';\r\nimport { createJob, updateJob } from '$lib/server/evidence-progress.js';"
	);
}

// In actions.upload: createJob and updateJob
const targetUpload = `    try {\r\n      const { title, description, caseId } = form.data;\r\n\r\n      // 1. Upload to SeaweedFS`;
const targetUploadLF = targetUpload.replace(/\r\n/g, '\n');

const replacementUpload = `    try {\r\n      const { title, description, caseId } = form.data;\r\n      const jobId = randomUUID();\r\n      createJob(jobId, String(locals.user.id));\r\n      updateJob(jobId, { step: 'uploading', progress: 15, message: \`Uploading \${file.name}...\` });\r\n\r\n      // 1. Upload to SeaweedFS`;
const replacementUploadLF = replacementUpload.replace(/\r\n/g, '\n');

if (pageServerCode.includes(targetUpload)) {
	pageServerCode = pageServerCode.replace(targetUpload, replacementUpload);
} else if (pageServerCode.includes(targetUploadLF)) {
	pageServerCode = pageServerCode.replace(targetUploadLF, replacementUploadLF);
}

// Return jobId in actions.upload
const targetReturn = `      return {\r\n        success: true,\r\n        evidence: newEvidence?.[0] ?? null,\r\n        previewUrl,\r\n      };`;
const targetReturnLF = targetReturn.replace(/\r\n/g, '\n');

const replacementReturn = `      updateJob(jobId, { step: 'extracting', progress: 35, message: 'Processing evidence metadata and extraction...' });\r\n      return {\r\n        success: true,\r\n        evidence: newEvidence?.[0] ?? null,\r\n        jobId,\r\n        previewUrl,\r\n      };`;
const replacementReturnLF = replacementReturn.replace(/\r\n/g, '\n');

if (pageServerCode.includes(targetReturn)) {
	pageServerCode = pageServerCode.replace(targetReturn, replacementReturn);
} else if (pageServerCode.includes(targetReturnLF)) {
	pageServerCode = pageServerCode.replace(targetReturnLF, replacementReturnLF);
}

fs.writeFileSync(pageServerPath, pageServerCode, 'utf8');
console.log('+page.server.ts updated with createJob and jobId return');

// 3. Patch +page.svelte to connect form.jobId to handleUploadAccepted
const pageSveltePath = 'sveltekit-frontend/src/routes/(app)/evidence/+page.svelte';
let pageSvelteCode = fs.readFileSync(pageSveltePath, 'utf8');

const targetEffect = `\tlet { data, form }: { data: PageData; form: ActionData } = $props();`;
const targetEffectLF = targetEffect.replace(/\r\n/g, '\n');

const replacementEffect = `\tlet { data, form }: { data: PageData; form: ActionData } = $props();\r\n\r\n\t$effect(() => {\r\n\t\tif (form?.success && form?.evidence && form?.jobId) {\r\n\t\t\thandleUploadAccepted(\r\n\t\t\t\tform.evidence.id,\r\n\t\t\t\tform.jobId,\r\n\t\t\t\tform.evidence.fileName,\r\n\t\t\t\tform.evidence.fileSize,\r\n\t\t\t\tDate.now()\r\n\t\t\t);\r\n\t\t}\r\n\t});`;
const replacementEffectLF = replacementEffect.replace(/\r\n/g, '\n');

if (!pageSvelteCode.includes('form?.jobId')) {
	if (pageSvelteCode.includes(targetEffect)) {
		pageSvelteCode = pageSvelteCode.replace(targetEffect, replacementEffect);
	} else if (pageSvelteCode.includes(targetEffectLF)) {
		pageSvelteCode = pageSvelteCode.replace(targetEffectLF, replacementEffectLF);
	}
	fs.writeFileSync(pageSveltePath, pageSvelteCode, 'utf8');
	console.log('+page.svelte wired with form?.jobId effect');
}
