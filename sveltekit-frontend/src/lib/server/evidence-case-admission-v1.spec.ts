import { describe, expect, it, vi } from 'vitest';
import { admitEvidenceCaseV1, requireOwnedEvidenceCaseV1 } from './evidence-case-admission-v1.js';

describe('admitEvidenceCaseV1', () => {
	it('requires ownership for a selected video or document case', async () => {
		const findOwnedCase = vi.fn().mockResolvedValue('owned-case');
		await expect(requireOwnedEvidenceCaseV1('requested-case', 12, findOwnedCase)).resolves.toBe('owned-case');
		expect(findOwnedCase).toHaveBeenCalledWith('requested-case', 12);
	});

	it('rejects a case that the authenticated user cannot access', async () => {
		const repository = {
			findOwnedCase: vi.fn().mockResolvedValue(null),
			findOwnedFallbackCase: vi.fn(),
			createFallbackCase: vi.fn()
		};

		await expect(
			admitEvidenceCaseV1('case-owned-by-someone-else', 12, repository)
		).rejects.toThrow('Selected case was not found');
		expect(repository.findOwnedCase).toHaveBeenCalledWith('case-owned-by-someone-else', 12);
		expect(repository.findOwnedFallbackCase).not.toHaveBeenCalled();
		expect(repository.createFallbackCase).not.toHaveBeenCalled();
	});

	it('creates or reuses only the authenticated user\'s fallback case', async () => {
		const repository = {
			findOwnedCase: vi.fn(),
			findOwnedFallbackCase: vi.fn().mockResolvedValue(null),
			createFallbackCase: vi.fn().mockResolvedValue('new-owned-case')
		};

		await expect(admitEvidenceCaseV1(null, 12, repository)).resolves.toBe('new-owned-case');
		expect(repository.findOwnedFallbackCase).toHaveBeenCalledWith(12);
		expect(repository.createFallbackCase).toHaveBeenCalledWith(12);
	});

	it('rejects users without an integer owner identity before repository access', async () => {
		const repository = {
			findOwnedCase: vi.fn(),
			findOwnedFallbackCase: vi.fn(),
			createFallbackCase: vi.fn()
		};

		await expect(admitEvidenceCaseV1(null, 0, repository)).rejects.toThrow(
			'Authenticated user has no valid evidence-owner identity'
		);
		expect(repository.findOwnedFallbackCase).not.toHaveBeenCalled();
		expect(repository.createFallbackCase).not.toHaveBeenCalled();
	});
});
