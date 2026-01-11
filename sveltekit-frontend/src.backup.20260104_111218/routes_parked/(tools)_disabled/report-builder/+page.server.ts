import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
  // Ensure user and session are explicitly typed as potentially null.
  // This addresses 'Property 'session' does not exist on type 'Locals'.' if App.Locals is not fully updated,
  // and makes the code more robust against undefined locals properties.
  const user = locals.user || null;
  const session = locals.session || null;

  // Default case ID for demo (can be parameterized later)
  const caseId = 'demo-case-001';

  return {
    user,
    session,
    caseId, // Corrected syntax: caseId is a property
    title: 'Report Builder', // Corrected syntax: title is a property
    description: 'Create professional legal reports with evidence organization',
  }; // Corrected syntax: removed extra '}'
};
