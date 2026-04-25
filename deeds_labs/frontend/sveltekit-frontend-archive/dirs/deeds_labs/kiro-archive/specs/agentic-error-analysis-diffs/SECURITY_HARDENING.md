# Security Hardening Guide

**Version**: 1.0.0
**Last Updated**: December 16, 2025
**Status**: Production Ready

## Overview

This guide covers security hardening for Error-Brain, including input validation, authentication, authorization, data protection, and threat mitigation.

## Table of Contents

1. [Input Validation](#input-validation)
2. [Authentication](#authentication)
3. [Authorization](#authorization)
4. [Data Protection](#data-protection)
5. [Rate Limiting](#rate-limiting)
6. [Access Control](#access-control)
7. [Threat Mitigation](#threat-mitigation)
8. [Security Checklist](#security-checklist)

---

## Input Validation

### Request Validation

#### 1. Error Analysis Request

```typescript
interface AnalyzeErrorRequest {
  errorMessage: string;      // Required, max 5000 chars
  errorStack?: string;       // Optional, max 10000 chars
  filePath?: string;         // Optional, max 500 chars
  codeContext?: string;      // Optional, max 10000 chars
  errorType?: string;        // Optional, enum
}

function validateAnalyzeRequest(body: any): AnalyzeErrorRequest {
  // Validate errorMessage
  if (!body.errorMessage || typeof body.errorMessage !== 'string') {
    throw new ValidationError('errorMessage is required and must be a string');
  }
  if (body.errorMessage.length > 5000) {
    throw new ValidationError('errorMessage must be <= 5000 characters');
  }

  // Validate errorStack
  if (body.errorStack && typeof body.errorStack !== 'string') {
    throw new ValidationError('errorStack must be a string');
  }
  if (body.errorStack && body.errorStack.length > 10000) {
    throw new ValidationError('errorStack must be <= 10000 characters');
  }

  // Validate filePath
  if (body.filePath && typeof body.filePath !== 'string') {
    throw new ValidationError('filePath must be a string');
  }
  if (body.filePath && body.filePath.length > 500) {
    throw new ValidationError('filePath must be <= 500 characters');
  }

  // Validate errorType
  const validTypes = ['typescript', 'svelte', 'runtime', 'unknown'];
  if (body.errorType && !validTypes.includes(body.errorType)) {
    throw new ValidationError(`errorType must be one of: ${validTypes.join(', ')}`);
  }

  return {
    errorMessage: body.errorMessage.trim(),
    errorStack: body.errorStack?.trim(),
    filePath: body.filePath?.trim(),
    codeContext: body.codeContext?.trim(),
    errorType: body.errorType || 'unknown'
  };
}
```

#### 2. Patch Generation Request

```typescript
interface GeneratePatchRequest {
  analysisId: string;        // Required, UUID format
  selectedFix: number;       // Required, 0-10
  context?: Record<string, unknown>;  // Optional
}

function validatePatchRequest(body: any): GeneratePatchRequest {
  // Validate analysisId
  if (!body.analysisId || typeof body.analysisId !== 'string') {
    throw new ValidationError('analysisId is required and must be a string');
  }
  if (!isValidUUID(body.analysisId)) {
    throw new ValidationError('analysisId must be a valid UUID');
  }

  // Validate selectedFix
  if (body.selectedFix === undefined || typeof body.selectedFix !== 'number') {
    throw new ValidationError('selectedFix is required and must be a number');
  }
  if (body.selectedFix < 0 || body.selectedFix > 10) {
    throw new ValidationError('selectedFix must be between 0 and 10');
  }

  return {
    analysisId: body.analysisId,
    selectedFix: Math.floor(body.selectedFix),
    context: body.context || {}
  };
}
```

### Input Sanitization

```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeInput(input: string): string {
  // Remove potentially dangerous characters
  const sanitized = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });

  // Remove null bytes
  return sanitized.replace(/\0/g, '');
}

function sanitizeFilePath(filePath: string): string {
  // Prevent directory traversal
  if (filePath.includes('..') || filePath.startsWith('/')) {
    throw new ValidationError('Invalid file path');
  }

  return filePath;
}
```

---

## Authentication

### Token Validation

```typescript
import jwt from 'jsonwebtoken';

interface AuthToken {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

function validateToken(token: string): AuthToken {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as AuthToken;

    // Check expiration
    if (decoded.exp < Date.now() / 1000) {
      throw new AuthError('Token expired');
    }

    return decoded;
  } catch (error) {
    throw new AuthError('Invalid token');
  }
}

function extractToken(request: Request): string {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header');
  }

  return authHeader.substring(7);
}
```

### Session Management

```typescript
interface Session {
  userId: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

function createSession(userId: string, request: Request): Session {
  const sessionId = generateSecureId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  return {
    userId,
    sessionId,
    createdAt: new Date(),
    expiresAt,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown'
  };
}

function validateSession(session: Session, request: Request): boolean {
  // Check expiration
  if (session.expiresAt < new Date()) {
    return false;
  }

  // Check IP address (optional, can be strict or lenient)
  const currentIP = request.headers.get('x-forwarded-for') || 'unknown';
  if (session.ipAddress !== currentIP) {
    // Log suspicious activity
    console.warn(`IP mismatch for session ${session.sessionId}`);
  }

  return true;
}
```

---

## Authorization

### Role-Based Access Control (RBAC)

```typescript
enum Role {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest'
}

interface User {
  id: string;
  email: string;
  role: Role;
}

function checkPermission(user: User, resource: string, action: string): boolean {
  const permissions: Record<Role, Record<string, string[]>> = {
    [Role.ADMIN]: {
      'error-brain': ['analyze', 'patch', 'history', 'delete'],
      'admin': ['manage-users', 'manage-settings']
    },
    [Role.USER]: {
      'error-brain': ['analyze', 'patch', 'history'],
      'admin': []
    },
    [Role.GUEST]: {
      'error-brain': ['analyze'],
      'admin': []
    }
  };

  const userPermissions = permissions[user.role] || {};
  const resourcePermissions = userPermissions[resource] || [];

  return resourcePermissions.includes(action);
}

function requirePermission(requiredRole: Role) {
  return (req: Request, res: Response, next: Function) => {
    const user = req.user as User;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.role !== requiredRole && user.role !== Role.ADMIN) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}
```

### Resource-Level Authorization

```typescript
async function checkResourceAccess(
  userId: string,
  resourceId: string,
  action: string
): Promise<boolean> {
  // Get resource owner
  const resource = await getResource(resourceId);

  if (!resource) {
    return false;
  }

  // Check ownership
  if (resource.ownerId !== userId) {
    // Check if user has shared access
    const access = await getSharedAccess(userId, resourceId);
    if (!access || !access.permissions.includes(action)) {
      return false;
    }
  }

  return true;
}
```

---

## Data Protection

### Encryption at Rest

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

function encryptData(data: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptData(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

### Encryption in Transit

```typescript
// Use HTTPS/TLS for all communications
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Set security headers
app.use((req, res, next) => {
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-XSS-Protection', '1; mode=block');
  next();
});
```

### Password Hashing

```typescript
import bcrypt from 'bcrypt';

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

---

## Rate Limiting

### Request Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const analyzeRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per hour
  message: 'Too many analyze requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  skip: (req) => req.user?.role === 'admin'
});

const patchRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 requests per hour
  message: 'Too many patch requests, please try again later',
  keyGenerator: (req) => req.user?.id || req.ip
});

app.post('/api/error-brain/analyze', analyzeRateLimiter, analyzeHandler);
app.patch('/api/error-brain/patch', patchRateLimiter, patchHandler);
```

### Distributed Rate Limiting

```typescript
import RedisStore from 'rate-limit-redis';
import redis from 'redis';

const redisClient = redis.createClient();

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:'
  }),
  windowMs: 60 * 60 * 1000,
  max: 100
});
```

---

## Access Control

### Feature Flag Enforcement

```typescript
function checkFeatureFlag(flag: string) {
  return (req: Request, res: Response, next: Function) => {
    const enabled = isFeatureFlagEnabled(flag, req.user?.id);

    if (!enabled) {
      return res.status(403).json({
        error: 'Feature is disabled',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

app.post(
  '/api/error-brain/analyze',
  checkFeatureFlag('ERROR_BRAIN_ENABLED'),
  analyzeHandler
);
```

### Namespace Isolation

```typescript
function enforceNamespace(namespace: string) {
  return (req: Request, res: Response, next: Function) => {
    const userNamespace = req.user?.namespace;

    if (userNamespace !== namespace) {
      return res.status(403).json({
        error: 'Access denied',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

app.post(
  '/api/error-brain/analyze',
  enforceNamespace('error-brain'),
  analyzeHandler
);
```

---

## Threat Mitigation

### SQL Injection Prevention

```typescript
// Use parameterized queries
async function getAnalysis(analysisId: string) {
  // Good: Parameterized query
  const result = await db.query(
    'SELECT * FROM error_brain_analyses WHERE id = $1',
    [analysisId]
  );

  return result.rows[0];
}

// Bad: String concatenation (vulnerable)
// const result = await db.query(`SELECT * FROM error_brain_analyses WHERE id = '${analysisId}'`);
```

### XSS Prevention

```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeOutput(data: string): string {
  return DOMPurify.sanitize(data, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
}

// In response
res.json({
  analysis: {
    errorMessage: sanitizeOutput(analysis.errorMessage),
    rootCause: sanitizeOutput(analysis.rootCause)
  }
});
```

### CSRF Protection

```typescript
import csrf from 'csurf';

const csrfProtection = csrf({ cookie: false });

app.post('/api/error-brain/analyze', csrfProtection, (req, res) => {
  // CSRF token validated automatically
  // Process request
});
```

### Denial of Service (DoS) Prevention

```typescript
// 1. Rate limiting (see above)
// 2. Request size limits
app.use(express.json({ limit: '1mb' }));

// 3. Timeout handling
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 second timeout
  next();
});

// 4. Connection limits
const server = app.listen(3000);
server.maxConnections = 1000;
```

---

## Security Checklist

- [ ] Input validation implemented
- [ ] Input sanitization implemented
- [ ] Authentication configured
- [ ] Authorization implemented
- [ ] RBAC configured
- [ ] Encryption at rest enabled
- [ ] Encryption in transit enabled
- [ ] Password hashing implemented
- [ ] Rate limiting configured
- [ ] Feature flags enforced
- [ ] Namespace isolation enforced
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] DoS prevention
- [ ] Security headers set
- [ ] Logging configured
- [ ] Monitoring configured
- [ ] Incident response plan
- [ ] Security testing completed

---

## Security Best Practices

### 1. Principle of Least Privilege

```typescript
// Good: Minimal permissions
const userPermissions = ['error-brain:analyze'];

// Bad: Excessive permissions
const userPermissions = ['*'];
```

### 2. Defense in Depth

```typescript
// Multiple layers of security
1. Input validation
2. Authentication
3. Authorization
4. Rate limiting
5. Encryption
6. Logging
7. Monitoring
```

### 3. Secure by Default

```typescript
// Default to secure settings
const config = {
  requireHTTPS: true,
  requireAuth: true,
  rateLimitEnabled: true,
  encryptionEnabled: true
};
```

### 4. Regular Security Updates

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Fix vulnerabilities
npm audit fix
```

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-syntax.html)

---

**Last Updated**: December 16, 2025
**Version**: 1.0.0
**Status**: Production Ready
