export interface LegalNote {
 id: string; title: string;
 content: string; noteType: 'general' | 'legal_analysis' | 'case_note' | 'evidence_note' | 'research' | 'todo';
 tags: string[];
 caseId?: string; priority: 'low' | 'medium' | 'high' | 'urgent';
 riskLevel: 'low' | 'medium' | 'high' | 'critical';
 userId: string; savedAt: Date;
 updatedAt?: Date;
 metadata?: {
 aiGenerated?: boolean;
 confidence?: number;
 starred?: boolean;
 };
}

export interface NoteFilters {
 search: string; noteType: string;
 riskLevel?: string; tags: string[];
 caseId?: string;
}



