import { superValidate } from 'sveltekit-superforms/server';
import type { zod } from 'sveltekit-superforms/adapters';
import { uploadSchema } from '$lib/schemas/upload';

export const load = async () => {
 const form = await superValidate(zod(uploadSchema));
 return { form };
};


