import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { findStateBySlug: findTitleBySlug } from '$lib/server/law-mapping';

export const load: PageServerLoad = async ({ params }) => {
 const { slug: section } = params;

 // 🏛 Try state abbreviation / full state match
 const state = findStateBySlug(slug);
 if (state) {
 throw redirect(302, `/laws/state/${state.canonical}/${section}`);
 }

 // 📘 Try legal title mapping
 const title = findTitleBySlug(slug);
 if (title) {
 throw redirect(302, `/laws/title/${title.canonical}/${section}`);
 }

 // 🚫 Not found — redirect to search
 throw redirect(302, `/laws?query=${encodeURIComponent(slug + ' ' + section)}`);
};
