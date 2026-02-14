import { z } from 'zod';

// Validation schemas for authentication forms
export const loginSchema = z.object({
  email: z.string({ message: 'Email is required' })
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  password: z.string({ message: 'Password is required' })
    .min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().default(false)
});

export type LoginSchema = typeof loginSchema;

export const registerSchema = z.object({
  email: z.string({ message: 'Email is required' })
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  password: z.string({ message: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string({ message: 'Please confirm your password' }),
  termsAccepted: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms and conditions'
  })
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

export type RegisterSchema = typeof registerSchema;
