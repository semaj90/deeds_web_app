/**
 * Canonical Evidence Types for Carousel Gallery & Expanded Evidence Viewer
 * Aligned with PostgreSQL 18 codebase_chunk_index & scene_assets schemas.
 */

export type EvidenceMediaType = 'video' | 'document' | 'audio' | 'biometric' | 'cctv' | 'splat' | 'forensic';

export interface EvidenceItem {
	id: string;
	exhibitNumber: string; // e.g. "E-002", "E-003"
	title: string;         // e.g. "Surveillance Video", "Contract A Signed"
	type: EvidenceMediaType;
	categoryBadge: string; // e.g. "SWIFT/MT103", "RAW H.265", "FLAC 24b", "SPZ v4", "PDF"
	badgeColor?: 'blue' | 'red' | 'purple' | 'amber' | 'cyan' | 'green' | 'default';
	mimeType: string;
	fileSize?: string;
	sha256?: string;
	timestamp?: string;
	statutes?: string[];
	sourceRef?: string;
	confidence?: number;
	summary?: string;
	extractedText?: string;
	isCurrent?: boolean;
	isActiveNode?: boolean;
	metrics?: {
		splatPoints?: string;
		duration?: string;
		pages?: number;
		sampleRate?: string;
		resolution?: string;
		fps?: number;
		caliperRms?: string;
		vectorSimilarity?: number;
	};
	chainOfCustody?: {
		recordedAt: string;
		intakeOfficer: string;
		storageBucket: string;
		pgvectorIndexId: string;
		admissibilityStatus: 'AUTHENTICATED' | 'CONDITIONAL' | 'CHALLENGED';
	};
	previewUrl?: string;
}

export const DEFAULT_EVIDENCE_ITEMS: EvidenceItem[] = [
	{
		id: 'e-002',
		exhibitNumber: 'E-002',
		title: 'Surveillance Video',
		type: 'video',
		categoryBadge: 'RAW H.265',
		badgeColor: 'blue',
		mimeType: 'video/mp4',
		fileSize: '412.4 MB',
		sha256: '7e9ba1c4d92004ef513c19b0aa93817112049e91849a01c4ba22c09191e4f3a2',
		timestamp: 'Oct 14, 2026 02:14:09 UTC',
		statutes: ['18 U.S.C. § 1001 (False Statements)', 'FRE 901(b)(9)'],
		sourceRef: 'CAM-SUB54B-CORRIDOR-NODE12',
		confidence: 99.1,
		isCurrent: true,
		summary: 'CCTV feed capturing Subject A. Vance entering Sub-station Room 4-B via keycard override at 02:14:09, directly refuting sworn statement of alibi.',
		metrics: {
			duration: '04:12',
			resolution: '1920x1080',
			fps: 60,
			vectorSimilarity: 0.942
		},
		chainOfCustody: {
			recordedAt: '2026-10-14T02:14:09Z',
			intakeOfficer: 'Det. K. Miller #8812',
			storageBucket: 'legal-evidence/exhibits/cctv-node12-raw.mp4',
			pgvectorIndexId: 'PGVECTOR #8812',
			admissibilityStatus: 'AUTHENTICATED'
		}
	},
	{
		id: 'e-003',
		exhibitNumber: 'E-003',
		title: 'Contract A Signed',
		type: 'document',
		categoryBadge: 'PDF / OCR',
		badgeColor: 'red',
		mimeType: 'application/pdf',
		fileSize: '2.8 MB',
		sha256: 'd832303be9f4a107293b74052f5c181a938c4109ba24ec98150493fae9812401',
		timestamp: 'Oct 14, 2026 01:45:00 UTC',
		statutes: ['18 U.S.C. § 1341 (Wire Fraud)', 'FRE 1002 (Best Evidence Rule)'],
		sourceRef: 'ARULIAN-OFFSHORE-LEDGER-DOC-44',
		confidence: 98.7,
		summary: 'Executed master service agreement assigning Cayman LLC shell routing permissions with manual cryptographic signature matching Vance keypair.',
		extractedText: 'ARTICLE 4.2: UNCONDITIONAL WIRE ROUTING AUTHORIZATION.\nThe undersigned Alexander Vance, Vice President of Infrastructure, hereby authorizes immediate manual dispatch of tranche A-9 capital reserves ($1,450,000 USD) to Arulian Cayman Trust without secondary board quorum.\nExecuted at 01:45:00 UTC.\n[PGP SIGNATURE: 0x9BF24A10C883]',
		metrics: {
			pages: 4,
			vectorSimilarity: 0.956
		},
		chainOfCustody: {
			recordedAt: '2026-10-14T01:45:00Z',
			intakeOfficer: 'Spc. Counsel R. Thorne',
			storageBucket: 'legal-evidence/exhibits/contract-a-signed.pdf',
			pgvectorIndexId: 'PGVECTOR #8814',
			admissibilityStatus: 'AUTHENTICATED'
		}
	},
	{
		id: 'e-004',
		exhibitNumber: 'E-004',
		title: 'Biometric Match 98%',
		type: 'biometric',
		categoryBadge: 'FACIAL / FINGERPRINT',
		badgeColor: 'default',
		mimeType: 'application/json',
		fileSize: '48 KB',
		sha256: 'f10492ab3984e1071289c0948b812039aa74191c9e817203a948571029348123',
		timestamp: 'Oct 14, 2026 02:14:12 UTC',
		statutes: ['FRE 702 (Expert Biometric Testimony)', '18 U.S.C. § 1001'],
		sourceRef: 'HARDWARE-TERMINAL-READER-4B',
		confidence: 98.4,
		summary: 'Dual biometric authentication event at Sub-station Door 4-B: 99.1% optical facial biometric vector alignment and 98.4% capacitive thumbprint match.',
		metrics: {
			vectorSimilarity: 0.984
		},
		chainOfCustody: {
			recordedAt: '2026-10-14T02:14:12Z',
			intakeOfficer: 'Forensics Lead S. Chen',
			storageBucket: 'legal-evidence/exhibits/biometric-telemetry-4b.json',
			pgvectorIndexId: 'PGVECTOR #8815',
			admissibilityStatus: 'AUTHENTICATED'
		}
	},
	{
		id: 'e-005',
		exhibitNumber: 'E-005',
		title: 'Audio Comm FLAC 24b',
		type: 'audio',
		categoryBadge: 'FLAC 24-BIT',
		badgeColor: 'purple',
		mimeType: 'audio/flac',
		fileSize: '18.4 MB',
		sha256: 'a983b271610491823abce0918237491029384710293847102938471029384710',
		timestamp: 'Oct 14, 2026 02:14:38 UTC',
		statutes: ['18 U.S.C. § 2511 (Wiretap Admissibility)', 'FRE 801(d)(2) (Party Admission)'],
		sourceRef: 'INTERCEPT-COMM-CELL48B',
		confidence: 96.4,
		summary: 'Lawful intercept recording of private satellite comms. Voiceprint match confirms Alexander Vance instructing: "release the token now, override the audit daemon".',
		extractedText: '[02:14:38] SPEAKER 1 (A. Vance): "Are we alone on the channel?"\n[02:14:40] SPEAKER 2 (Operator): "Switchboard 4-B link active, sir."\n[02:14:42] SPEAKER 1 (A. Vance): "Release the token now. Override the audit daemon before the board logs in."',
		metrics: {
			duration: '01:14',
			sampleRate: '48.0 kHz 24-bit',
			vectorSimilarity: 0.964
		},
		chainOfCustody: {
			recordedAt: '2026-10-14T02:14:38Z',
			intakeOfficer: 'Special Agent M. Vance',
			storageBucket: 'legal-evidence/exhibits/comm-intercept-04.flac',
			pgvectorIndexId: 'PGVECTOR #8816',
			admissibilityStatus: 'AUTHENTICATED'
		}
	},
	{
		id: 'e-006',
		exhibitNumber: 'E-006',
		title: 'CCTV Priority',
		type: 'cctv',
		categoryBadge: 'CAM-N-04',
		badgeColor: 'amber',
		mimeType: 'image/jpeg',
		fileSize: '4.2 MB',
		sha256: 'c830192847102938471029384710293847102938471029384710293847102938',
		timestamp: 'Oct 14, 2026 02:14:41 UTC',
		statutes: ['FRE 901', '18 U.S.C. § 1001'],
		sourceRef: 'CAM-N-04-BADGE-BYPASS',
		confidence: 99.4,
		summary: 'High-speed badge reader bypass snapshot showing Subject Vance manually deploying cryptographic hardware dongle into terminal rack.',
		metrics: {
			resolution: '3840x2160',
			vectorSimilarity: 0.978
		},
		chainOfCustody: {
			recordedAt: '2026-10-14T02:14:41Z',
			intakeOfficer: 'Det. K. Miller #8812',
			storageBucket: 'legal-evidence/exhibits/badge-bypass-cam04.jpg',
			pgvectorIndexId: 'PGVECTOR #8817',
			admissibilityStatus: 'AUTHENTICATED'
		}
	},
	{
		id: 'e-007',
		exhibitNumber: 'E-007',
		title: 'Witness St TXT',
		type: 'document',
		categoryBadge: 'DEP-TRANSCRIPT',
		badgeColor: 'default',
		mimeType: 'text/plain',
		fileSize: '142 KB',
		sha256: 'b492019485710293847102938471029384710293847102938471029384710293',
		timestamp: 'Oct 14, 2026 14:15:00 UTC',
		statutes: ['FRE 613 (Prior Inconsistent Statement)', '18 U.S.C. § 1621 (Perjury)'],
		sourceRef: '2026-USDC-DEPO-774-PAGE42',
		confidence: 100.0,
		summary: 'Sworn deposition of Alexander Vance under oath stating: "I was in the executive suite at 500 Arulian Way... I never accessed physical keys".',
		extractedText: 'Q. (MR. THORNE): Did you personally access the sub-station terminal room 4-B or authenticate via keycard proxy?\nA. (MR. VANCE): Absolutely not. I was in the executive suite at 500 Arulian Way during the internal restructuring.',
		metrics: {
			pages: 88,
			vectorSimilarity: 0.991
		},
		chainOfCustody: {
			recordedAt: '2026-10-14T14:15:00Z',
			intakeOfficer: 'Court Reporter D. Walsh',
			storageBucket: 'legal-corpus/depositions/vance-alexander-depo.txt',
			pgvectorIndexId: 'PGVECTOR #8818',
			admissibilityStatus: 'AUTHENTICATED'
		}
	},
	{
		id: 'e-008',
		exhibitNumber: 'E-008',
		title: 'DNA Marker Gen 0.99',
		type: 'forensic',
		categoryBadge: 'STR FORENSIC LAB',
		badgeColor: 'blue',
		mimeType: 'application/json',
		fileSize: '840 KB',
		sha256: 'e892019485710293847102938471029384710293847102938471029384710293',
		timestamp: 'Oct 15, 2026 09:30:00 UTC',
		statutes: ['FRE 702 (Forensic Genotyping)', 'CODIS Standard'],
		sourceRef: 'STATE-FORENSIC-LAB-REPORT-994',
		confidence: 99.99,
		summary: 'Touch DNA profile recovered from Terminal 4-B rack handle yielding complete 24-locus STR profile matching Alexander Vance with 1 in 4.8 trillion random match probability.',
		metrics: {
			vectorSimilarity: 0.999
		},
		chainOfCustody: {
			recordedAt: '2026-10-15T09:30:00Z',
			intakeOfficer: 'Criminalist L. Gomez #401',
			storageBucket: 'legal-evidence/exhibits/dna-str-analysis-vance.json',
			pgvectorIndexId: 'PGVECTOR #8819',
			admissibilityStatus: 'AUTHENTICATED'
		}
	},
	{
		id: 'e-009',
		exhibitNumber: 'E-009',
		title: '1.48M Active Splat',
		type: 'splat',
		categoryBadge: 'SPZ v4 / 3D GAUSSIAN',
		badgeColor: 'cyan',
		mimeType: 'model/gltf-binary',
		fileSize: '14.8 MB',
		sha256: '9cf64920ea705f6f96aec83305e0224d0a94ab9ddb39d63b2472dda6ed37fd5b',
		timestamp: 'Oct 14, 2026 02:31:00 UTC',
		statutes: ['FRE 901(b)(9)', 'ISO-17025 Calibrated'],
		sourceRef: 'PHOTOGRAMMETRY-SCAN-15-SUB4B',
		confidence: 99.4,
		isActiveNode: true,
		summary: 'Volumetric 3D Gaussian Splatting scene reconstruction of Sub-station Room 4-B with SIMD RMS Caliper error of 0.003mm, proving sightline occlusion.',
		metrics: {
			splatPoints: '1.48M Splats',
			caliperRms: '0.003mm',
			vectorSimilarity: 0.9942
		},
		chainOfCustody: {
			recordedAt: '2026-10-14T02:31:00Z',
			intakeOfficer: 'Spatial Forensic Specialist T. Vance',
			storageBucket: 'legal-evidence/splats/substation-4b-1.48m.spz',
			pgvectorIndexId: 'PGVECTOR #8820',
			admissibilityStatus: 'AUTHENTICATED'
		}
	}
];
