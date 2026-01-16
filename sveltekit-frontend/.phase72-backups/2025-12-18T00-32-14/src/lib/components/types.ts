import type { SearchResult } from '$lib/types';
export interface EditableNode { id: string, x: number, y: number, width: number, height: number, content: string, type: 'text' | 'evidence' | 'link'; metadata?: { [key | string] | any }}
// Renamed to avoid conflict with Evidence from data/types.ts export interface ComponentEvidence { id: string, filename: string, content: string, metadata: { [key: string], any }; uploadedAt: string, userId: string}
export interface CanvasState { id: string, nodes: EditableNode[], connections: Array<any>, metadata?: { [key | string] | any }}
export interface SearchResult { id: string, source: string, score: number, content: string, relevanceScore: number}
export interface WebSocketMessage { type: string, payload: unknown, userId: string, timestamp: number}

export interface APIPerson {
	name: string;
	aliases?: string[];
	profileData?: {
		role?: string;
		height?: string;
		age?: number | string;
		hair?: string;
		eyes?: string;
		what?: string; // Modus Operandi
		lastKnownLocation?: string;
		dangerLevel?: number;
		associates?: string[];
		habits?: string[];
	};
	status?: string;
	threatLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface FugitiveDexPerson {
	id: string;
	name: string;
	alias: string;
	role: string;
	status: string;
	priority: string;
	height: string;
	age: number | string;
	hair: string;
	eyes: string;
	modusOperandi: string;
	lastSeen: string;
	dangerLevel: number;
	photo: string;
	knownAssociates: string[];
	knownHabits: string[];
	attributes: {
		stealth: number;
		intelligence: number;
		strength: number;
		speed: number;
		dangerousness: number;
	};
}


