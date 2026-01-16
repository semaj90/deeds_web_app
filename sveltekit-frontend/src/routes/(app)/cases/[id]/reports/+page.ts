import type { PageLoad } from './$types.js';

export const load: PageLoad = async ({ fetch, params }) => {
  let reports = [];

  try {
    const res = await fetch(`/api/v1/reports?caseId=${params.id}`);
    if (res.ok) {
      reports = await res.json();
    }
  } catch {
    // ignore for now
  }

  return {
    reports,
  };
};
