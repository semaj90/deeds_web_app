import { z, ZodError } from 'zod';

/**
 * Middleware function to validate and parse a request body against a Zod schema.
 * This function assumes the request body can be read as JSON.
 *
 * @param request The Request object from the API route handler.
 * @param schema The Zod schema to validate the request against.
 * @returns A Promise that resolves with the validated data object if successful.
 * @throws An error object containing validation details if validation fails.
 */
export async function validateRequest(request: Request, schema: z.ZodTypeAny): Promise<z.ZodInfer<z.ZodTypeAny>> {
	try {
		const body = await request.json();
		const result = schema.safeParse(body);

		if (result.success) {
			return result.data;
		} else {
			// Throw a structured error mimicking a validation failure
			throw new Error('Validation Failed');
		}
	} catch (error) {
		// Handle JSON parsing errors or other unexpected failures
		if (error instanceof SyntaxError) {
			throw new Error('Invalid JSON format in request body.');
		}
		// Re-throw generic errors for other issues
		throw error;
	}
}

/**
 * Helper function to wrap the middleware for cleaner use in API routes.
 * It catches validation errors and returns a standardized error response.
 *
 * @param request The Request object.
 * @param schema The Zod schema.
 * @param errorHandler The function to call on validation failure (e.g., returning a JSON response).
 * @returns A Promise resolving to the validated data or triggering the provided error handler.
 */
export async function safeValidateRequest(
	request: Request,
	schema: z.ZodTypeAny,
	errorHandler: (error: { status: number; message: string }) => Promise<void>
): Promise<z.ZodInfer<z.ZodTypeAny>> {
	try {
		const validatedData = await validateRequest(request, schema);
		return validatedData;
	} catch (error) {
		if (error instanceof Error && error.message.includes('Validation Failed')) {
			// Use the provided error handler for controlled responses
			return errorHandler({ status: 400, message: 'Validation failed for request payload.' });
		}
		// For other errors (e.g., JSON parsing failure), throw them up the chain
		throw error;
	}
}