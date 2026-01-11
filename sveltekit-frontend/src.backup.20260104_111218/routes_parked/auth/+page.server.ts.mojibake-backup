import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types.js';

// Simple validation schemas
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    firstName: z.string().min(2, 'First name must be at least 2 characters'),
    lastName: z.string().min(2, 'Last name must be at least 2 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    role: z.enum(['prosecutor', 'investigator', 'analyst', 'admin']),
    department: z.string().min(2, 'Department is required'),
    jurisdiction: z.string().min(2, 'Jurisdiction is required'),
    badgeNumber: z.string().optional(),
    agreeToTerms: z.string().transform((val) => val === 'true'),
    agreeToPrivacy: z.string().transform((val) => val === 'true'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })
  .refine((data) => data.agreeToTerms === true, {
    message: 'You must agree to the terms',
    path: ['agreeToTerms'],
  })
  .refine((data) => data.agreeToPrivacy === true, {
    message: 'You must agree to privacy policy',
    path: ['agreeToPrivacy'],
  });

export const load: PageServerLoad = async () => {
  return {};
};

export const actions: Actions = {
  // Handle both login and register in unified flow
  default: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    // Determine if this is login or register based on presence of additional fields
    const firstName = formData.get('firstName') as string;
    const isRegister = !!firstName;

    try {
      if (isRegister) {
        // Registration flow
        const registerData = {
          email,
          firstName,
          lastName: formData.get('lastName') as string,
          password,
          confirmPassword: formData.get('confirmPassword') as string,
          role: formData.get('role') as string,
          department: formData.get('department') as string,
          jurisdiction: formData.get('jurisdiction') as string,
          badgeNumber: (formData.get('badgeNumber') as string) || '',
          agreeToTerms: formData.get('agreeToTerms') as string,
          agreeToPrivacy: formData.get('agreeToPrivacy') as string,
        };

        // Validate registration data
        const validation = registerSchema.safeParse(registerData);
        if (!validation.success) {
          const errors = validation.error.errors;
          return fail(400, {
            error: errors[0]?.message || 'Registration validation failed',
          });
        }

        // For demo purposes - just set session and redirect
        // In production, you would create user in database
        console.log('Demo Registration: ', { email, role: registerData.role });

        // Set demo session
        cookies.set('session', `demo-register-${Date.now()}`, {
          path: '/',
          maxAge: 60 * 60 * 24 * 7, // 1 week
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
        });

        throw redirect(302, '/dashboard');
      } else {
        // Login flow
        const loginData = { email, password };

        // Validate login data
        const validation = loginSchema.safeParse(loginData);
        if (!validation.success) {
          const errors = validation.error.errors;
          return fail(400, {
            error: errors[0]?.message || 'Login validation failed',
          });
        }

        // For demo purposes - accept any valid email/password
        console.log('Demo Login: ', { email });

        // Set demo session
        cookies.set('session', `demo-login-${Date.now()}`, {
          path: '/',
          maxAge: 60 * 60 * 24 * 7, // 1 week
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
        });

        throw redirect(302, '/dashboard');
      }
    } catch (error: Error | unknown) {
      // Don't catch redirects
      if (error instanceof Response) {
        throw error;
      }

      console.error('Auth error: ', error);
      return fail(500, {
        error: 'An error occurred during authentication. Please try again.',
      });
    }
  },
}; // touched
