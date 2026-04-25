# Error-Brain & Legal-AI Separation - Design Document

## Overview

This design establishes architectural separation between error-brain (development/debugging) and legal-ai (production) systems. The separation is achieved through:

1. **Namespace Isolation**: Distinct URL prefixes (`/api/error-brain/` vs `/api/legal-ai/`)
2. **Feature Flags**: Environment-based configuration to enable/disable features
3. **Middleware Enforcement**: Request routing based on feature availability
4. **Data Isolation**: Separate database schemas and access controls
5. **Logging Separation**: Distinct log files and monitoring per feature

## Architecture

### High-Level Flow

```
Request → Feature Flag Check → Namespace Router → Feature Middleware → Handler
                                    ↓
                        ┌─────────────┴─────────────┐
                        ↓                           ↓
                   Error-Brain                  Legal-AI
                   (Dev Mode)                   (Prod Mode)
                        ↓                           ↓
                   Dev Auth                    Prod Auth
                   Dev Logging                 Prod Logging
                   Debug Info                  Sanitized Info
```

### Components and Interfaces

#### 1. Feature Flag Manager

```typescript
interface FeatureFlags {
  errorBrain: {
    enabled: boolean;
    requireAuth: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  legalAi: {
    enabled: boolean;
    requireAuth: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

class FeatureFlagManager {
  loadFromEnvironment(): FeatureFlags;
  validate(flags: FeatureFlags): boolean;
  isFeatureEnabled(feature: 'errorBrain' | 'legalAi'): boolean;
  updateFlags(flags: Partial<FeatureFlags>): void;
}
```

#### 2. Namespace Router Middleware

```typescript
interface NamespaceContext {
  feature: 'errorBrain' | 'legalAi';
  enabled: boolean;
  authRequired: boolean;
  logLevel: string;
}

class NamespaceRouter {
  route(path: string): NamespaceContext;
  enforceFeature(context: NamespaceContext): void;
  logRequest(context: NamespaceContext, request: Request): void;
}
```

#### 3. Feature-Specific Handlers

```typescript
// Error-Brain Handler
class ErrorBrainHandler {
  analyzeError(error: ErrorData): AnalysisResult;
  generatePatch(analysis: AnalysisResult): PatchResult;
  applyPatch(patch: PatchResult): ApplyResult;
}

// Legal-AI Handler
class LegalAiHandler {
  extractCitations(document: Document): Citation[];
  mapAuthorities(citations: Citation[]): AuthorityMap;
  generateReport(map: AuthorityMap): Report;
}
```

#### 4. Data Isolation Layer

```typescript
interface DataStore {
  // Error-Brain tables
  errorBrainAnalyses: Table;
  errorBrainPatches: Table;
  errorBrainHistory: Table;

  // Legal-AI tables
  legalAiCitations: Table;
  legalAiAuthorities: Table;
  legalAiReports: Table;
}

class DataIsolationLayer {
  getErrorBrainStore(): DataStore;
  getLegalAiStore(): DataStore;
  enforceAccess(feature: string, table: string): void;
}
```

#### 5. Logging System

```typescript
interface LogContext {
  feature: 'errorBrain' | 'legalAi';
  timestamp: Date;
  userId: string;
  operation: string;
  details: Record<string, any>;
}

class FeatureLogger {
  logErrorBrain(context: LogContext): void;
  logLegalAi(context: LogContext): void;
  getErrorBrainLogs(filter: LogFilter): Log[];
  getLegalAiLogs(filter: LogFilter): Log[];
}
```

## Data Models

### Error-Brain Data Schema

```sql
-- Error-Brain Analysis
CREATE TABLE error_brain_analyses (
  id UUID PRIMARY KEY,
  route_path VARCHAR NOT NULL,
  error_message TEXT NOT NULL,
  error_type VARCHAR NOT NULL,
  analysis_result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL,
  CONSTRAINT fk_user FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Error-Brain Patches
CREATE TABLE error_brain_patches (
  id UUID PRIMARY KEY,
  analysis_id UUID NOT NULL,
  patch_content TEXT NOT NULL,
  confidence_score FLOAT NOT NULL,
  applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_analysis FOREIGN KEY (analysis_id) REFERENCES error_brain_analyses(id)
);
```

### Legal-AI Data Schema

```sql
-- Legal-AI Citations
CREATE TABLE legal_ai_citations (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL,
  citation_text TEXT NOT NULL,
  citation_type VARCHAR NOT NULL,
  authority_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_document FOREIGN KEY (document_id) REFERENCES documents(id),
  CONSTRAINT fk_authority FOREIGN KEY (authority_id) REFERENCES authorities(id)
);

-- Legal-AI Authorities
CREATE TABLE legal_ai_authorities (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  jurisdiction VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Feature Flag Enforcement
*For any* request to `/api/error-brain/*`, if error-brain feature flag is disabled, the system SHALL return 403 Forbidden response.
**Validates: Requirements 1.2, 2.1**

### Property 2: Namespace Isolation
*For any* error-brain request and any legal-ai request, the system SHALL NOT allow error-brain handlers to access legal-ai data tables.
**Validates: Requirements 6.2, 6.3**

### Property 3: Authentication Separation
*For any* request to error-brain endpoints, the system SHALL use development authentication, and for legal-ai endpoints, the system SHALL use production authentication.
**Validates: Requirements 2.2, 3.2**

### Property 4: Logging Separation
*For any* error-brain operation, the system SHALL log to error-brain.log, and for legal-ai operations, the system SHALL log to legal-ai.log.
**Validates: Requirements 7.1, 7.2**

### Property 5: Environment Configuration Consistency
*For any* environment (development, staging, production), the feature flags SHALL match the expected configuration for that environment.
**Validates: Requirements 8.1, 8.2, 8.3**

### Property 6: Data Access Control
*For any* request to access data, the system SHALL verify the requesting feature has permission to access that data table before returning results.
**Validates: Requirements 6.1, 6.4**

### Property 7: Feature Availability Consistency
*For any* API documentation request, if a feature is disabled, the system SHALL mark those endpoints as unavailable in the documentation.
**Validates: Requirements 10.4**

### Property 8: Error Response Consistency
*For any* disabled feature request, the system SHALL return consistent error responses (403 for error-brain, 503 for legal-ai).
**Validates: Requirements 2.5, 3.5**

## Error Handling

### Error Categories

1. **Feature Disabled**: Feature flag is false
   - Response: 403 Forbidden (error-brain) or 503 Service Unavailable (legal-ai)
   - Logging: Warning level

2. **Authentication Failed**: User lacks required permissions
   - Response: 401 Unauthorized
   - Logging: Warning level

3. **Data Access Violation**: Attempting to access wrong feature's data
   - Response: 403 Forbidden
   - Logging: Error level (security event)

4. **Configuration Invalid**: Feature flags misconfigured
   - Response: 500 Internal Server Error
   - Logging: Error level

5. **Service Unavailable**: Backend service down
   - Response: 503 Service Unavailable
   - Logging: Error level

### Recovery Strategies

1. **Feature Flag Validation**: Validate on startup and periodically
2. **Safe Defaults**: Use conservative defaults if configuration invalid
3. **Graceful Degradation**: Disable problematic features, keep others running
4. **Retry Logic**: Exponential backoff for transient failures
5. **Fallback Handlers**: Use cached data if service unavailable

## Testing Strategy

### Unit Testing

- Feature flag manager: Test flag loading, validation, updates
- Namespace router: Test routing logic for different paths
- Data isolation: Test access control enforcement
- Logging: Test log output format and separation

### Property-Based Testing

- **Property 1**: Generate random requests to error-brain endpoints with various flag states
- **Property 2**: Generate random data access attempts and verify isolation
- **Property 3**: Generate random authentication scenarios
- **Property 4**: Generate random operations and verify logging
- **Property 5**: Generate random environment configurations
- **Property 6**: Generate random data access requests
- **Property 7**: Generate random documentation requests
- **Property 8**: Generate random disabled feature requests

### Integration Testing

- Test feature flag updates at runtime
- Test request routing with both features enabled/disabled
- Test data isolation with concurrent requests
- Test logging output to separate files
- Test environment-specific configurations

### Test Framework

- **Unit Tests**: Vitest with mocking
- **Property Tests**: fast-check for property-based testing
- **Integration Tests**: Playwright for end-to-end scenarios

## Deployment Considerations

### Environment Variables

```bash
# Development
ERROR_BRAIN_ENABLED=true
LEGAL_AI_ENABLED=false
LOG_LEVEL=debug

# Staging
ERROR_BRAIN_ENABLED=true
LEGAL_AI_ENABLED=true
LOG_LEVEL=info

# Production
ERROR_BRAIN_ENABLED=false
LEGAL_AI_ENABLED=true
LOG_LEVEL=warn
```

### Database Migrations

1. Create error-brain schema (if not exists)
2. Create legal-ai schema (if not exists)
3. Add feature flag configuration table
4. Create separate log tables

### Monitoring

- Track feature flag changes
- Monitor error rates per feature
- Track data access patterns
- Monitor logging output

