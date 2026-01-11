/**
 * Person of Interest (POI) Types
 * TypeScript interfaces for POI management
 */

export type POIStatus = 'person_of_interest' | 'witness' | 'suspect' | 'victim' | 'informant';
export type POIPriority = 'low' | 'medium' | 'high' | 'critical';
export type POIThreatLevel = 'low' | 'medium' | 'high' | 'extreme';
export type RelationshipType = 'family' | 'colleague' | 'friend' | 'suspect' | 'unknown';

export interface PersonOfInterest {
  id: string;
  caseId: string;
  name: string;
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  address?: string;
  status: POIStatus;
  priority: POIPriority;
  threatLevel: POIThreatLevel;
  occupation?: string;
  lastKnownLocation?: string;
  physicalDescription?: string;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface KnownAssociate {
  id: string;
  poiId: string;
  associateId: string;
  relationshipType: RelationshipType;
  notes?: string;
  createdAt: string;
  associate?: PersonOfInterest;
}

export interface POIAlias {
  id: string;
  poiId: string;
  aliasName: string;
  createdAt: string;
}

export interface POISearchResult {
  poiId: string;
  name: string;
  status: POIStatus;
  priority: POIPriority;
  threatLevel: POIThreatLevel;
  similarityScore: number;
}

export interface POIListResponse {
  pois: PersonOfInterest[];
  total: number;
  limit: number;
  offset: number;
}

export interface POICreateRequest {
  caseId: string;
  name: string;
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  address?: string;
  status: POIStatus;
  priority: POIPriority;
  threatLevel: POIThreatLevel;
  occupation?: string;
  lastKnownLocation?: string;
  physicalDescription?: string;
}

export interface POIUpdateRequest {
  name?: string;
  dateOfBirth?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: POIStatus;
  priority?: POIPriority;
  threatLevel?: POIThreatLevel;
  occupation?: string;
  lastKnownLocation?: string;
  physicalDescription?: string;
}

export interface AssociateCreateRequest {
  associateId: string;
  relationshipType: RelationshipType;
  notes?: string;
}

export interface POISearchRequest {
  query: string;
  caseId?: string;
  status?: POIStatus;
  priority?: POIPriority;
  limit?: number;
}
