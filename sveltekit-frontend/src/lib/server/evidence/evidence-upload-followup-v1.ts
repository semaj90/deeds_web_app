/**
 * Optional work scheduled after the canonical upload_pipeline job has been
 * durably enqueued must not roll back the accepted evidence or orphan its job.
 */
export async function registerPdfOcrFollowupAfterQueueV1(
	shouldRegister: boolean,
	register: () => Promise<unknown>,
): Promise<'SKIPPED' | 'REGISTERED' | 'FAILED'> {
	if (!shouldRegister) return 'SKIPPED';
	try {
		await register();
		return 'REGISTERED';
	} catch {
		return 'FAILED';
	}
}
