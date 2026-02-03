import db from '$lib/server/db/client';
import { cases, evidence, personsOfInterest, reports } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { caseId, type = 'charging_memo' } = await request.json();

		if (!caseId) {
			return json({ error: 'Case ID is required' }, { status: 400 });
		}

		// Fetch case data
		const [caseData] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

		if (!caseData) {
			return json({ error: 'Case not found' }, { status: 404 });
		}

		// Fetch evidence and persons for context
		const evidenceData = await db.select().from(evidence).where(eq(evidence.caseId, caseId));
		const personsData = await db
			.select()
			.from(personsOfInterest)
			.where(eq(personsOfInterest.caseId, caseId));

		// Generate report content based on case data
		const generatedContent = generateChargingMemo(caseData, evidenceData, personsData);

		// Create new report
		const [newReport] = await db
			.insert(reports)
			.values({
				caseId,
				title: `${type === 'charging_memo' ? 'Charging Memo' : 'Report'} - ${caseData.title}`,
				type,
				contentHtml: generatedContent.html,
				contentJson: generatedContent.json,
				rawModelOutput: generatedContent.raw,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning();

		return json({
			success: true,
			report: newReport
		});
	} catch (error) {
		console.error('Error generating report:', error);
		return json(
			{
				error: 'Failed to generate report',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// Helper function to generate charging memo content
function generateChargingMemo(
	caseData: any,
	evidenceData: any[],
	personsData: any[]
): {
	html: string;
	json: any;
	raw: string;
} {
	const html = `
		<h1>Charging Memorandum</h1>
		<h2>Case: ${caseData.title || 'Untitled Case'}</h2>

		<h3>Case Summary</h3>
		<p><strong>Status:</strong> ${caseData.status || 'Unknown'}</p>
		<p><strong>Priority:</strong> ${caseData.priority || 'Normal'}</p>
		<p><strong>Opened:</strong> ${caseData.createdAt ? new Date(caseData.createdAt).toLocaleDateString() : 'Unknown'}</p>

		<h3>Persons of Interest</h3>
		${personsData.length > 0 ? `
			<ul>
				${personsData.map((p) => `<li><strong>${p.name || 'Unknown'}</strong> - ${p.role || 'Role unknown'}</li>`).join('')}
			</ul>
		` : '<p>No persons of interest identified.</p>'}

		<h3>Evidence Summary</h3>
		${evidenceData.length > 0 ? `
			<ul>
				${evidenceData.map((e) => `<li><strong>${e.type || 'Unknown type'}</strong>: ${e.description || 'No description'}</li>`).join('')}
			</ul>
		` : '<p>No evidence currently associated with this case.</p>'}

		<h3>Recommended Charges</h3>
		<p><em>(To be completed by prosecutor)</em></p>

		<h3>Legal Analysis</h3>
		<p><em>(To be completed)</em></p>

		<h3>Conclusion and Recommendation</h3>
		<p><em>(To be completed)</em></p>
	`.trim();

	const json = {
		type: 'doc',
		content: [
			{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Charging Memorandum' }] },
			{
				type: 'heading',
				attrs: { level: 2 },
				content: [{ type: 'text', text: `Case: ${caseData.title || 'Untitled Case'}` }]
			},
			{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Case Summary' }] },
			{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Status: ' }, { type: 'text', text: caseData.status || 'Unknown' }] }
			// ... more JSON structure
		]
	};

	return {
		html,
		json,
		raw: `Generated charging memo for case: ${caseData.title}`
	};
}
