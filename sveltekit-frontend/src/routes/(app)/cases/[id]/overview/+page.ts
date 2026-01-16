import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ fetch, params }) => {
 const caseId = params.id;$1;$2 fetch(`/api/v1/evidence/by-case/${caseId}`),
 fetch(`/api/v1/cases/${caseId}/persons`)]);

 const evidence = evidenceRes.ok ? await evidenceRes.json() : [];
 const persons = personsRes.ok ? await personsRes.json() : [];

 return {
 caseId,
 evidence,
 persons,
 };
};
