/**
 * STRUCTURED ERROR HANDLING GUIDE
 * Legal AI Platform - Lucia v3 Authentication System
 *
 * This guide demonstrates how the new structured error handling system
 * provides consistent, actionable error messages for both backend logging
 * and frontend user messaging.
 */

// ============================================================================
// 1. ERROR CLASS HIERARCHY
// ============================================================================

/**
 * All errors in the auth system inherit from AuthError
 * Each error has:
 *   - message: Human-readable error message
 *   - code: Machine-readable error code for front-end logic
 *   - status: HTTP status code (401, 400, 402, 500, etc.)
 *   - context?: Optional debug/logging context
 */

// AuthError (base - 401)
//   ├── RegistrationError (400)
//   ├── LoginError (401)
//   ├── SessionError (401)
//   ├── PasswordError (400)
//   ├── ProfileError (400)
//   └── MicroserviceError (502)

// ============================================================================
// 2. ERROR CODES REFERENCE
// ============================================================================

// REGISTRATION ERRORS
EMAIL_TAKEN                   // Email already registered
INVALID_EMAIL                 // Email format invalid
WEAK_PASSWORD                 // Password < 8 chars
REGISTRATION_FAILED           // Generic registration failure

// LOGIN ERRORS
INVALID_CREDENTIALS           // Email/password combination invalid
ACCOUNT_INACTIVE              // Account deactivated by admin
LOGIN_FAILED                  // Generic login failure

// SESSION ERRORS
SESSION_NOT_FOUND             // Session ID doesn't exist
SESSION_EXPIRED               // Session past expiration time
SESSION_INVALID               // Session invalid or corrupted
SESSION_ERROR                 // Generic session error
AUTH_REQUIRED                 // Endpoint requires authentication

// PASSWORD ERRORS
PASSWORD_MISMATCH             // Passwords don't match
PASSWORD_CHANGE_FAILED        // Generic password change failure
CURRENT_PASSWORD_INCORRECT    // Old password verification failed

// PROFILE ERRORS
PROFILE_UPDATE_FAILED         // Generic profile update failure
USER_NOT_FOUND                // User doesn't exist

// MICROSERVICE ERRORS
CASE_SERVICE_UNAVAILABLE      // Go services down/unreachable
CASE_NOT_FOUND                // Case ID doesn't exist in microservice
DOCUMENT_SERVICE_UNAVAILABLE  // Document service unreachable

// DATABASE ERRORS
DB_ERROR                      // Generic database error
DB_CONNECTION_FAILED          // Cannot connect to database

// GENERIC
UNKNOWN_ERROR                 // Unexpected error

// ============================================================================
// 3. THROWING STRUCTURED ERRORS
// ============================================================================

// PATTERN: Import error classes at top of file
import {
  RegistrationError,
  LoginError,
  SessionError,
  PasswordError,
  ProfileError,
  MicroserviceError,
  ERROR_CODES,
} from '$lib/server/errors';

// EXAMPLE 1: Registration - Email already exists
if (existingUser.length > 0) {
  throw new RegistrationError(
    'A user with this email already exists',
    ERROR_CODES.EMAIL_TAKEN,
    { email: data.email }  // Context for logging
  );
}

// EXAMPLE 2: Login - Invalid credentials (intentionally vague for security)
throw new LoginError(
  'Invalid email or password',
  ERROR_CODES.INVALID_CREDENTIALS,
  { email }  // Only logged internally, not sent to client
);

// EXAMPLE 3: Session - Session expired
throw new SessionError(
  'Session not found or expired',
  ERROR_CODES.SESSION_NOT_FOUND,
  { sessionId }
);

// EXAMPLE 4: Password - Current password incorrect
throw new PasswordError(
  'Current password is incorrect',
  ERROR_CODES.CURRENT_PASSWORD_INCORRECT,
  { userId }
);

// EXAMPLE 5: Microservice - Case not found
throw new MicroserviceError(
  'Case not found',
  ERROR_CODES.CASE_NOT_FOUND,
  { caseId }
);

// ============================================================================
// 4. CATCHING AND FORMATTING ERRORS IN API ENDPOINTS
// ============================================================================

import { json, type RequestHandler } from '@sveltejs/kit';
import { authService, auth } from '$lib/server/auth';
import { isAuthError, formatErrorResponse } from '$lib/server/errors';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    // ... your auth logic

    const user = await authService.login(email, password);
    const session = await authService.createSession(user.id);

    // Success response
    return json({ success: true, user, session }, { status: 200 });
  } catch (error) {
    // Check if it's a structured auth error
    if (isAuthError(error)) {
      // Format and send with appropriate HTTP status
      const errorResponse = formatErrorResponse(error);
      return json(errorResponse, { status: error.status });
    }

    // Unknown error - don't leak implementation details
    console.error('[API] Unexpected error:', error);
    return json(
      {
        success: false,
        error: {
          message: 'An unexpected error occurred',
          code: 'UNKNOWN_ERROR',
          status: 500,
        },
      },
      { status: 500 }
    );
  }
};

// ============================================================================
// 5. FRONT-END ERROR HANDLING
// ============================================================================

/**
 * Example: Handling structured errors in frontend component
 */

// import { isAuthError } from '$lib/server/errors';

// async function handleLogin(email: string, password: string) {
//   try {
//     const response = await fetch('/api/auth/login', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ email, password }),
//     });

//     const data = await response.json();

//     if (!response.ok) {
//       // Structured error response
//       const error = data.error;

//       // Handle different error codes
//       switch (error.code) {
//         case 'INVALID_CREDENTIALS':
//           showToast('Incorrect email or password', { type: 'error' });
//           break;

//         case 'ACCOUNT_INACTIVE':
//           showToast(
//             'Your account has been deactivated. Contact support.',
//             { type: 'error' }
//           );
//           break;

//         case 'AUTH_REQUIRED':
//           // Redirect to login
//           goto('/login');
//           break;

//         default:
//           showToast(error.message || 'Login failed', { type: 'error' });
//       }
//       return;
//     }

//     // Success
//     const { user, session } = data;
//     localStorage.setItem('user', JSON.stringify(user));
//     goto('/dashboard');
//   } catch (err) {
//     showToast('Network error. Please try again.', { type: 'error' });
//   }
// }

// ============================================================================
// 6. API RESPONSE FORMAT
// ============================================================================

// SUCCESS RESPONSE (200 - 201)
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "prosecutor"
  },
  "session": {
    "id": "session_id",
    "expiresAt": "2025-10-18T12:00:00Z"
  }
}

// ERROR RESPONSE (400 - 500)
{
  "success": false,
  "error": {
    "message": "A user with this email already exists",
    "code": "EMAIL_TAKEN",
    "status": 400,
    "context": {
      "email": "user@example.com"
    }
  }
}

// ============================================================================
// 7. LOGGING STRATEGY
// ============================================================================

/**
 * Server-side logging (src/lib/server/auth.ts)
 */

// SUCCESS: Always log with [AUTH] prefix
console.log('[AUTH] User registered successfully:', { userId: newUser.id, email: newUser.email });

// ERROR: Log full context with [AUTH] prefix
console.error('[AUTH] Registration failed with unknown error:', error);

// SECURITY: Never log passwords or sensitive data
// ONLY include in context:
// - userId (uuid, not PII)
// - email (acceptable for auth logging)
// - sessionId (uuid)
// - error message (generic)

/**
 * Client-side error display (frontend component)
 */

// Show user-friendly message from error.message
showToast(error.message, { type: 'error' });

// Handle specific behaviors based on error.code
if (error.code === 'EMAIL_TAKEN') {
  // Show "try different email" hint
}

// Use error.status for HTTP logic
if (error.status === 401) {
  // Redirect to login
}

// ============================================================================
// 8. INTEGRATION CHECKLIST
// ============================================================================

// ✅ Import custom error classes in auth.ts
// ✅ Update all AuthService methods to throw structured errors
// ✅ Import isAuthError and formatErrorResponse in API endpoints
// ✅ Use try/catch to catch and format errors
// ✅ Return json(errorResponse, { status: error.status })
// ✅ Create frontend error handling logic
// ✅ Test error scenarios (invalid email, password, account inactive, etc.)
// ✅ Monitor logs for [AUTH] prefix errors
// ✅ Document error codes for frontend team

// ============================================================================
// 9. DEBUGGING TIPS
// ============================================================================

// In auth.ts, look for [AUTH] prefix to follow the flow:
// [AUTH] User logged in successfully: { userId: ..., email: ... }
// [AUTH] Password change and all sessions invalidated: { userId: ... }
// [AUTH] Session created: { userId: ..., sessionId: ... }

// In API logs, formatted errors show full structure:
// [API] Auth error in /api/auth/login: {
//   success: false,
//   error: {
//     message: 'Invalid email or password',
//     code: 'INVALID_CREDENTIALS',
//     status: 401,
//     context: { email: 'test@example.com' }
//   }
// }

// Front-end network tab shows same error format, enabling:
// - Error handler to match by code
// - Toast message from message field
// - Proper HTTP status for retry logic
