import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return {
    title: 'Retrieval Index',
    description: 'Browse indexed packets and SOM clusters from the Go search service'
  };
};
