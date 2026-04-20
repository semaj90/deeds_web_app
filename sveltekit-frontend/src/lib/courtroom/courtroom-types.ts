/**
 * Types for the Phoenix Wright-style 3D courtroom simulation.
 */

export interface CourtroomCharacter {
	id: string;
	name: string;
	role: 'prosecutor' | 'defense' | 'judge' | 'witness' | 'narrator';
	color: string;
	position: { x: number; y: number; z: number };
}

export interface CameraPreset {
	alpha: number;
	beta: number;
	radius: number;
	target: { x: number; y: number; z: number };
}

export type CourtroomView = 'prosecution' | 'defense' | 'judge' | 'witness' | 'wide';

/** Map trial phases to camera positions */
export const PHASE_CAMERA_MAP: Record<string, CourtroomView> = {
	pretrial: 'wide',
	arraignment: 'judge',
	discovery: 'wide',
	motions: 'judge',
	jury_selection: 'judge',
	opening_statements: 'wide',
	prosecution_case: 'prosecution',
	defense_case: 'defense',
	plaintiff_case: 'prosecution',
	closing_arguments: 'wide',
	jury_instructions: 'judge',
	verdict: 'judge',
	sentencing: 'judge',
	judgment: 'judge',
	filing: 'prosecution',
	answer: 'defense',
	mediation: 'wide',
	trial_prep: 'wide',
};

/** Map dialogue roles to camera views */
export const ROLE_CAMERA_MAP: Record<string, CourtroomView> = {
	prosecutor: 'prosecution',
	defense: 'defense',
	judge: 'judge',
	witness: 'witness',
	narrator: 'wide',
};

/** N64/NES role colors */
export const ROLE_COLORS: Record<string, string> = {
	prosecutor: '#92cc41',
	defense: '#f83800',
	judge: '#f7d51d',
	witness: '#3cbcfc',
	narrator: '#7c7c7c',
};

/** Animation types supported by the courtroom system */
export const ANIMATION_TYPES = [
	'idle', 'speaking', 'objection', 'walk', 'gesture', 'point', 'sit', 'stand',
	'present_evidence', 'react_surprised', 'react_angry', 'react_sad', 'nod', 'shake_head',
] as const;

export type CourtroomAnimType = typeof ANIMATION_TYPES[number];

/** Visual effects that can be triggered during playback */
export const TIMELINE_EFFECTS = [
	'screen_flash', 'shake', 'spotlight', 'dim',
] as const;

export type TimelineEffect = typeof TIMELINE_EFFECTS[number];
