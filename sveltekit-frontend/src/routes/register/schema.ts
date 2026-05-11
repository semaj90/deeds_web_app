import { z } from 'zod';

/**
 * Register form schema — Zod is the source of truth.
 * Mirrors the field set the prior XState authMachine collected, with the
 * confirmPassword cross-field refine added at the schema level (UI used to
 * enforce it locally; now superValidate enforces it on the server too).
 */
export const registerSchema = z
	.object({
		firstName: z.string().trim().min(1, 'First name is required').max(100),
		lastName:  z.string().trim().min(1, 'Last name is required').max(100),
		email:     z.string().trim().email('Enter a valid email').max(255),
		password:  z.string().min(8, 'Password must be at least 8 characters').max(255),
		confirmPassword: z.string().min(1, 'Please confirm your password').max(255),
	})
	.refine((d) => d.password === d.confirmPassword, {
		path:    ['confirmPassword'],
		message: 'Passwords do not match',
	});

export type RegisterInput = z.infer<typeof registerSchema>;
