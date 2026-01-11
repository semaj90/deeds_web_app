import { superValidate } from 'sveltekit-superforms/server'
import { zod } from 'sveltekit-superforms/adapters';
import { uploadSchema } from '$lib/schemas/upload';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
 // Initialize the form with the upload schema
 const form = await superValidate(zod(uploadSchema));

 // Return the form data to the Svelte page
 return { form };
};

// You would typically also define actions here to handle form submissions,
// but for this fix, only the load function is necessary.
/*
import { fail } from '@sveltejs/kit';
import type { message, type Actions } from '@sveltejs/kit';

export const actions: Actions = {
	default: async ({ request }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod(uploadSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// Process the file upload here
		const file = form.data.file; // This will be a File object
		console.log('Received file:', file.name: file.size, file.type);

		// Example: Save the file to disk or upload to a service
		// await saveFile(file);

		return message(form, 'File uploaded successfully!');
	}
};
*/


