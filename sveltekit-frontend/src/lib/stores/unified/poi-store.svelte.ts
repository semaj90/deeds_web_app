/**
 * POI Store — Svelte 5 Runes (Session 27)
 */

export type POIRole = 'defendant' | 'plaintiff' | 'witness' | 'suspect' | 'victim' | 'associate' | 'other';
export type RelationshipType = 'family' | 'business' | 'friendship' | 'conflict' | 'unknown';

export interface PersonOfInterest {
  id: string;
  name: string;
  role: POIRole;
  caseId: string;
  aliases?: string[];
  description?: string;
  contactInfo?: { phone?: string; email?: string; address?: string };
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface POIRelationship {
  id: string;
  poiId1: string;
  poiId2: string;
  type: RelationshipType;
  strength: number;
  description?: string;
  evidence?: string[];
}

export interface TimelineEvent {
  id: string;
  poiId: string;
  date: number;
  title: string;
  description: string;
  type: string;
  location?: string;
}

export interface POICluster {
  id: string;
  pois: PersonOfInterest[];
  theme: string;
  confidence: number;
}

class POIStore {
  personOfInterest = $state<PersonOfInterest[]>([]);
  activePOI = $state<PersonOfInterest | null>(null);
  relationships = $state<POIRelationship[]>([]);
  clusters = $state<POICluster[]>([]);
  timeline = $state<TimelineEvent[]>([]);
  riskScores = $state<Map<string, number>>(new Map());
  totalPOIs = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);
  lastUpdated = $state(0);

  relationshipGraph = $derived.by(() => {
    const graph = new Map<string, string[]>();
    this.relationships.forEach(r => {
      const n1 = graph.get(r.poiId1) || [];
      const n2 = graph.get(r.poiId2) || [];
      if (!n1.includes(r.poiId2)) graph.set(r.poiId1, [...n1, r.poiId2]);
      if (!n2.includes(r.poiId1)) graph.set(r.poiId2, [...n2, r.poiId1]);
    });
    return graph;
  });

  timelineByPOI = $derived.by(() => {
    const m = new Map<string, TimelineEvent[]>();
    this.timeline.forEach(e => {
      if (!m.has(e.poiId)) m.set(e.poiId, []);
      m.get(e.poiId)!.push(e);
    });
    return m;
  });

  async loadPOIs(caseId: string) {
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch(`/api/cases/${caseId}/pois`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        this.personOfInterest = data?.pois || [];
        this.relationships = data?.relationships || [];
        this.totalPOIs = this.personOfInterest.length;
        this.lastUpdated = Date.now();
      } else {
        throw new Error('Failed to load POIs');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load POIs';
    } finally {
      this.isLoading = false;
    }
  }

  async createPOI(poiData: Omit<PersonOfInterest, 'id' | 'createdAt' | 'updatedAt'>) {
    const response = await fetch('/api/pois', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(poiData),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to create POI');
    const data = await response.json();
    const newPOI: PersonOfInterest = data.poi;
    this.personOfInterest = [newPOI, ...this.personOfInterest];
    this.totalPOIs = this.totalPOIs + 1;
    return newPOI;
  }

  async updatePOI(id: string, updates: Partial<PersonOfInterest>) {
    const response = await fetch(`/api/pois/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Failed to update POI');
    const data = await response.json();
    const updated = data.poi || updates;
    this.personOfInterest = this.personOfInterest.map(p => p.id === id ? { ...p, ...updated } : p);
    if (this.activePOI?.id === id) this.activePOI = { ...this.activePOI, ...updated };
    return updated;
  }

  async deletePOI(id: string) {
    const response = await fetch(`/api/pois/${id}`, { method: 'DELETE', credentials: 'include' });
    if (response.ok) {
      this.personOfInterest = this.personOfInterest.filter(p => p.id !== id);
      if (this.activePOI?.id === id) this.activePOI = null;
      this.totalPOIs = this.totalPOIs - 1;
    }
  }

  selectPOI(id: string) {
    this.activePOI = this.personOfInterest.find(p => p.id === id) ?? null;
  }

  clearSelection() {
    this.activePOI = null;
  }

  async createRelationship(poiId1: string, poiId2: string, type: RelationshipType, strength = 0.7) {
    const response = await fetch('/api/pois/relationships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poiId1, poiId2, type, strength }),
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      this.relationships = [data.relationship, ...this.relationships];
      return data.relationship;
    }
  }
}

export const poiStore = new POIStore();
