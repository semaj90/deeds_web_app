# Person of Interest Feature - Requirements

**Date**: December 14, 2025
**Status**: Specification Phase
**Feature Name**: person-of-interest

---

## Introduction

The Person of Interest (POI) feature is a comprehensive module for managing and analyzing individuals related to legal cases. It integrates with the YoRHa Legal AI platform to provide structured intelligence analysis, relationship mapping, and vector-based similarity search for identifying connections between persons of interest.

---

## Glossary

- **Person of Interest (POI)**: An individual being tracked or analyzed in relation to a legal case
- **Known Associates**: Related individuals connected to a POI
- **SuperForms**: SvelteKit form library for handling complex form state and validation
- **pgvector**: PostgreSQL extension for vector similarity search
- **Qdrant**: Vector database for semantic search and similarity matching
- **YoRHa Theme**: Dark, professional legal investigation UI theme with crimson accents
- **NES Command Center**: Retro-style terminal interface for system operations

---

## Requirements

### Requirement 1: POI Profile Management

**User Story**: As an investigator, I want to create and manage detailed profiles for persons of interest, so that I can track and analyze individuals related to my cases.

#### Acceptance Criteria

1. WHEN an investigator creates a new POI THEN the system SHALL create a profile with name, date of birth, contact information, and status
2. WHEN a POI profile is created THEN the system SHALL persist the data to PostgreSQL legal_ai_db immediately
3. WHEN an investigator updates a POI profile THEN the system SHALL save changes to the database and update all related records
4. WHEN viewing a POI profile THEN the system SHALL display all profile information with proper formatting and validation

---

### Requirement 2: Known Associates Management

**User Story**: As an investigator, I want to manage known associates for each POI, so that I can track relationships and connections between individuals.

#### Acceptance Criteria

1. WHEN adding a known associate to a POI THEN the system SHALL create a relationship record linking the two individuals
2. WHEN viewing a POI THEN the system SHALL display all known associates in a structured list with relationship details
3. WHEN removing an associate THEN the system SHALL delete the relationship and maintain data integrity
4. WHEN searching for POIs THEN the system SHALL return results based on known associates using vector similarity

---

### Requirement 3: SuperForms Integration

**User Story**: As a developer, I want to use SuperForms for POI form management, so that I can handle complex form state, validation, and error handling consistently.

#### Acceptance Criteria

1. WHEN rendering POI forms THEN the system SHALL use SuperForms for state management and validation
2. WHEN submitting a POI form THEN the system SHALL validate all required fields before submission
3. WHEN form validation fails THEN the system SHALL display error messages for each invalid field
4. WHEN form submission succeeds THEN the system SHALL persist data and show success confirmation

---

### Requirement 4: Vector Search Integration

**User Story**: As an investigator, I want to search for similar POIs using vector embeddings, so that I can identify connections and patterns across cases.

#### Acceptance Criteria

1. WHEN a POI profile is created THEN the system SHALL generate embeddings for profile text and store in pgvector
2. WHEN searching for similar POIs THEN the system SHALL query pgvector and return ranked results
3. WHEN viewing search results THEN the system SHALL display similarity scores and relationship details
4. WHEN updating a POI profile THEN the system SHALL regenerate embeddings and update vector store

---

### Requirement 5: Qdrant Integration

**User Story**: As an investigator, I want to use Qdrant for semantic search across POI data, so that I can find relevant individuals based on case context.

#### Acceptance Criteria

1. WHEN indexing POI data THEN the system SHALL store embeddings in Qdrant collection
2. WHEN performing semantic search THEN the system SHALL query Qdrant and return contextually relevant results
3. WHEN filtering search results THEN the system SHALL apply case, status, and priority filters
4. WHEN deleting a POI THEN the system SHALL remove associated vectors from Qdrant

---

### Requirement 6: YoRHa Theme UI/UX

**User Story**: As a user, I want the POI interface to follow the YoRHa Legal AI theme, so that it provides a consistent, professional investigative experience.

#### Acceptance Criteria

1. WHEN viewing POI pages THEN the system SHALL display dark background with crimson accents
2. WHEN interacting with POI forms THEN the system SHALL use consistent button styles and input fields
3. WHEN displaying POI lists THEN the system SHALL use proper spacing, typography, and visual hierarchy
4. WHEN showing status indicators THEN the system SHALL use color-coded badges for priority and status

---

### Requirement 7: Command Center Integration

**User Story**: As an investigator, I want to access POI management from the Command Center, so that I can manage persons of interest alongside other case operations.

#### Acceptance Criteria

1. WHEN viewing the Command Center THEN the system SHALL display POI statistics and quick actions
2. WHEN clicking "Persons" in Command Center THEN the system SHALL navigate to POI management interface
3. WHEN creating a POI from Command Center THEN the system SHALL open a modal form with proper context
4. WHEN viewing POI metrics THEN the system SHALL display total count, active investigations, and recent activity

---

### Requirement 8: Svelte 5 & SvelteKit 2 Compatibility

**User Story**: As a developer, I want the POI feature to use Svelte 5 runes and SvelteKit 2 patterns, so that it maintains consistency with the modern codebase.

#### Acceptance Criteria

1. WHEN rendering POI components THEN the system SHALL use Svelte 5 runes ($state, $derived, $effect)
2. WHEN handling form state THEN the system SHALL use SvelteKit 2 form actions and server-side validation
3. WHEN managing data THEN the system SHALL use proper TypeScript types and interfaces
4. WHEN loading data THEN the system SHALL use SvelteKit load functions with proper error handling

---

## Success Metrics

- ✅ POI profiles can be created, read, updated, and deleted
- ✅ Known associates can be managed and tracked
- ✅ Vector search returns relevant results with >85% accuracy
- ✅ UI follows YoRHa theme consistently
- ✅ All forms use SuperForms with proper validation
- ✅ Data persists to PostgreSQL and Qdrant
- ✅ Command Center integration working
- ✅ Svelte 5 runes used throughout

