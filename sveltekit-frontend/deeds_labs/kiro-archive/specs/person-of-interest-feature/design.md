# Person of Interest Feature - Design

**Date**: December 14, 2025
**Status**: Design Phase
**Feature Name**: person-of-interest

---

## Overview

The Person of Interest (POI) feature provides comprehensive management and analysis of individuals related to legal cases. It integrates vector search, relationship mapping, and AI-powered analysis to help investigators identify connections and patterns.

### Key Components
- POI Profile Management (CRUD operations)
- Known Associates Relationship Tracking
- Vector-based Similarity Search (pgvector + Qdrant)
- SuperForms Integration for Complex Forms
- YoRHa Theme UI/UX
- Command Center Integration

---

## Architecture

### Frontend Architecture
```
sveltekit-frontend/src/routes/(app)/persons-of-interest/
├── +page.svelte              # POI list view
├── +page.server.ts           # Server-side data loading
├── [id]/
│   ├── +page.svelte          # POI detail view
│   ├── +page.server.ts       # Detail data loading
│   └── +layout.svelte        # Detail layout
├── create/
│   ├── +page.svelte          # Create form
│   └── +page.server.ts       # Form actions
└── components/
    ├── POIForm.svelte        # Reusable POI form (SuperForms)
    ├── AssociatesList.svelte # Known associates display
    ├── SearchResults.svelte   # Vector search results
    └── POICard.svelte        # POI list item component
```

### Backend Architecture
```
backend/
├── api/
│   └── persons-of-interest/
│       ├── +server.ts        # REST endpoints
│       ├── [id]/+server.ts   # Detail endpoints
│       └── search/+server.ts # Vector search endpoint
├── services/
│   ├── poi_service.py        # POI business logic
│   ├── vector_service.py     # Vector embedding service
│   └── qdrant_service.py     # Qdrant integration
└── sql/
    └── poi_schema.sql        # Database schema
```

---

## Components and Interfaces

### POI Data Model
```typescript
interface PersonOfInterest {
  id: string;
  caseId: string;
  name: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  status: 'person_of_interest' | 'witness' | 'suspect' | 'victim' | 'informant';
  priority: 'low' | 'medium' | 'high' | 'critical';
  threatLevel: 'low' | 'medium' | 'high' | 'extreme';
  profileData: {
    occupation?: string;
    knownAssociates?: string[];
    lastKnownLocation?: string;
    physicalDescription?: string;
    aliases?: string[];
  };
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

interface KnownAssociate {
  id: string;
  poiId: string;
  associateId: string;
  relationshipType: 'family' | 'colleague' | 'friend' | 'suspect' | 'unknown';
  notes?: string;
  createdAt: Date;
}
```

### API Endpoints
```
GET    /api/persons-of-interest              # List all POIs
POST   /api/persons-of-interest              # Create POI
GET    /api/persons-of-interest/[id]         # Get POI details
PUT    /api/persons-of-interest/[id]         # Update POI
DELETE /api/persons-of-interest/[id]         # Delete POI
GET    /api/persons-of-interest/search       # Vector search
POST   /api/persons-of-interest/[id]/associates  # Add associate
DELETE /api/persons-of-interest/[id]/associates/[associateId]  # Remove associate
```

### SuperForms Integration
```typescript
// POI form schema
const poiFormSchema = z.object({
  name: z.string().min(1, 'Name required'),
  dateOfBirth: z.string().date('Invalid date'),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(['person_of_interest', 'witness', 'suspect', 'victim', 'informant']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  threatLevel: z.enum(['low', 'medium', 'high', 'extreme']),
  occupation: z.string().optional(),
  knownAssociates: z.array(z.string()).optional(),
  lastKnownLocation: z.string().optional(),
  physicalDescription: z.string().optional(),
  aliases: z.array(z.string()).optional()
});
```

---

## Data Models

### PostgreSQL Schema
```sql
CREATE TABLE persons_of_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id),
  name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  status VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL,
  threat_level VARCHAR(50) NOT NULL,
  occupation VARCHAR(255),
  last_known_location TEXT,
  physical_description TEXT,
  embedding vector(384),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE known_associates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id UUID NOT NULL REFERENCES persons_of_interest(id),
  associate_id UUID NOT NULL REFERENCES persons_of_interest(id),
  relationship_type VARCHAR(50) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_poi_case_id ON persons_of_interest(case_id);
CREATE INDEX idx_poi_embedding ON persons_of_interest USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_associates_poi_id ON known_associates(poi_id);
```

### Qdrant Collection Schema
```json
{
  "name": "persons_of_interest",
  "vectors": {
    "size": 384,
    "distance": "Cosine"
  },
  "payload_schema": {
    "poi_id": {"type": "keyword"},
    "case_id": {"type": "keyword"},
    "name": {"type": "text"},
    "status": {"type": "keyword"},
    "priority": {"type": "keyword"},
    "threat_level": {"type": "keyword"}
  }
}
```

---

## Error Handling

### Validation Errors
- SuperForms handles client-side validation
- Server-side validation in SvelteKit actions
- Clear error messages for each field
- Form state preserved on validation failure

### Database Errors
- Connection pool exhaustion → Retry with exponential backoff
- Constraint violations → User-friendly error messages
- Transaction failures → Rollback and notify user

### Vector Search Errors
- Embedding generation failure → Log and skip
- Qdrant connection failure → Fallback to database search
- Invalid query vectors → Return empty results

---

## Testing Strategy

### Unit Tests
- POI form validation
- Vector embedding generation
- Relationship management logic
- Status and priority filtering

### Property-Based Tests
- Vector search consistency
- Relationship integrity
- Data persistence round-trip
- Search result ranking

### Integration Tests
- Full CRUD workflow
- Vector search with filters
- Associate relationship management
- Command Center integration

---

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: POI Creation Persistence
*For any* valid POI data, creating a POI should result in the data being persisted to PostgreSQL and queryable immediately after creation.

**Validates: Requirements 1.2**

### Property 2: Vector Embedding Consistency
*For any* POI profile, generating embeddings for the same profile text should produce identical vectors across multiple generations.

**Validates: Requirements 4.1**

### Property 3: Known Associates Relationship Integrity
*For any* POI with known associates, removing an associate should delete the relationship while preserving both POI records.

**Validates: Requirements 2.3**

### Property 4: Vector Search Relevance
*For any* search query, vector search results should be ranked by similarity score in descending order.

**Validates: Requirements 4.3**

### Property 5: Form Validation Round-Trip
*For any* valid POI form submission, the submitted data should match the persisted data after retrieval.

**Validates: Requirements 3.4**

### Property 6: Qdrant Index Synchronization
*For any* POI created or updated, the corresponding vector should be indexed in Qdrant within 5 seconds.

**Validates: Requirements 5.1**

### Property 7: Status Consistency
*For any* POI, the status field should only contain valid enum values from the defined set.

**Validates: Requirements 1.1**

---

## UI/UX Design

### YoRHa Theme Colors
- Background: `#0f0f23` (dark navy)
- Accent: `#dc2626` (crimson red)
- Text: `#ffffff` (white)
- Secondary: `#6b7280` (gray)

### Component Styling
- POI Cards: Dark background with crimson border on hover
- Forms: Consistent input styling with validation feedback
- Lists: Proper spacing and visual hierarchy
- Status Badges: Color-coded by priority/status

### Responsive Design
- Mobile: Single column layout
- Tablet: Two column layout
- Desktop: Three column layout with sidebar

---

## Performance Considerations

- Vector search: <100ms for 10k POIs
- Form submission: <500ms including validation
- Page load: <2s for POI list
- Search indexing: Async background job

---

## Security Considerations

- All POI data encrypted at rest
- Vector embeddings stored securely
- Access control by case assignment
- Audit logging for all modifications
- SQL injection prevention via parameterized queries

