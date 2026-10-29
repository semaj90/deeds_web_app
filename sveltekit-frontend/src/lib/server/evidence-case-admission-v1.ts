export interface EvidenceCaseRepository {
	findOwnedCase(caseId: string, ownerId: number): Promise<string | null>;
	findOwnedFallbackCase(ownerId: number): Promise<string | null>;
	createFallbackCase(ownerId: number): Promise<string | null>;
}

export class EvidenceCaseNotFoundError extends Error {
	constructor() {
		super('Selected case was not found');
		this.name = 'EvidenceCaseNotFoundError';
	}
}

export async function requireOwnedEvidenceCaseV1(
	caseId: string,
	ownerId: number,
	findOwnedCase: (caseId: string, ownerId: number) => Promise<string | null>
): Promise<string> {
	if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
		throw new Error('Authenticated user has no valid evidence-owner identity');
	}
	const ownedCaseId = await findOwnedCase(caseId, ownerId);
	if (!ownedCaseId) throw new EvidenceCaseNotFoundError();
	return ownedCaseId;
}

export async function admitEvidenceCaseV1(
	requestedCaseId: string | null,
	ownerId: number,
	repository: EvidenceCaseRepository
): Promise<string> {
	if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
		throw new Error('Authenticated user has no valid evidence-owner identity');
	}

	if (requestedCaseId) return requireOwnedEvidenceCaseV1(requestedCaseId, ownerId, repository.findOwnedCase);

	const fallbackCaseId = await repository.findOwnedFallbackCase(ownerId);
	if (fallbackCaseId) return fallbackCaseId;

	const createdCaseId = await repository.createFallbackCase(ownerId);
	if (!createdCaseId) throw new Error('Failed to resolve a fallback case for uploaded evidence');
	return createdCaseId;
}
