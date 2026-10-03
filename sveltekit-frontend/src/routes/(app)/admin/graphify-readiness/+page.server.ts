import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadWorkspaceAdmissionPanelV1 } from '$lib/server/atlas/admission/workspace-admission-panel-v1.js';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin') throw redirect(303, '/dashboard');

  // Read-only observation of workspace admission receipts + graphify_executions.
  // Degrades to null on failure; never throws and never substitutes sample values.
  try {
    return { admission: await loadWorkspaceAdmissionPanelV1(), admissionError: null as string | null };
  } catch (error) {
    return {
      admission: null,
      admissionError: error instanceof Error ? error.message : String(error),
    };
  }
};
