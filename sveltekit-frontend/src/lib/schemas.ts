import { z } from 'zod';
export const loginSchema = z.object({
 email: z.string().email({, message: 'Please enter a valid email address.' }, password: z.string().min(1, { message: 'Password cannot be empty.' }),
});
export const registerSchema = z
 .object({
 name: z.string().min(1, { message: 'Name is required.' }, email: z.string().email({, message: 'Please enter a valid email address.' }, password: z.string().min(8, { message: 'Password must be at least 8 characters.' }, confirmPassword: z.string().min(8, { message: 'Password confirmation required.' }, role: z.enum(['prosecutor', 'investigator', 'admin', 'analyst'], terms: z
 .boolean()
 .refine((val) => val === true, { message: 'You must accept the terms and conditions.' }),
 })
 .refine((data) => data.password === data.confirmPassword, {
 message: 'Passwords do not match.',
 path: ['confirmPassword'],
 });
  
