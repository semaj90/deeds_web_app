export interface BoardDossierContext {
	reports: { id: string; title: string; status: string; type: string | null }[];
	people: { id: string; name: string; role: string | null; status: string }[];
	unavailable: ('reports' | 'people')[];
}

export interface BoardDossierConnection {
	id: string;
	fromEvidenceId: string;
	toEvidenceId: string;
	connectionType: string;
	label: string | null;
	isVisible: boolean | null;
}

export const boardTerms = {
	Exhibit: 'A source item filed as evidence in this case.',
	'Case report': 'A written work product filed in the case. Its status follows the reports workflow.',
	'Evidence report': 'A report documenting examination of specific exhibits and their source references.',
	'Person of interest (POI)': 'A person whose connection to the case investigators are examining.',
	'Case role': 'The recorded relationship of a person to the case, such as witness or complainant.',
	'Hypothesis': 'A proposed explanation to test against source evidence.',
	'Chain of custody': 'The recorded history of evidence possession, transfer and handling.',
	'Source revision': 'The saved identifier for the exact version of an exhibit used in a record or analysis.',
	'AI analysis': 'Machine-generated observations or suggestions for investigator review.',
};

export const boardRelationshipTerms: Record<string, string> = {
	related: 'Records an association between two exhibits.',
	supports: 'Adds evidence in favor of a stated point.',
	corroborates: 'Independently supports a detail recorded elsewhere.',
	contradicts: 'Records a conflict between sources.',
	references: 'Points to another source or exhibit.',
	derived: 'Identifies material produced from a source exhibit.',
	same_person: 'Records a proposed link between references to a person.',
	timeline: 'Connects exhibits by time or sequence.',
	chain_of_custody: 'Connects records of evidence handling or transfer.',
	alibi: 'Connects material relevant to an account of someone’s whereabouts.',
	motive: 'Connects material relevant to a proposed reason for an act.',
	opportunity: 'Connects material relevant to the circumstances that could allow an act.',
	means: 'Connects material relevant to how an act could have been carried out.',
	witness_statement: 'Connects an exhibit to a recorded witness account.',
	physical_evidence: 'Connects material to an object, trace or physical exhibit.',
	digital_evidence: 'Connects digital records or artifacts.',
	circumstantial: 'Flags material used to support an inference.',
	direct_evidence: 'Flags material offered as direct evidence of a point.',
	hearsay: 'Flags a statement for hearsay review.',
	privileged: 'Flags material for privilege review.',
	inadmissible: 'Flags an admissibility concern for review.',
};

export const reportStatusTerms = {
	Draft: 'Work in progress.',
	Pending: 'Awaiting the next review or workflow step.',
	Completed: 'Marked complete in the reports workflow.',
	Published: 'Released through the reports workflow.',
};

export const personStatusTerms = {
	Active: 'The case team is actively reviewing the record.',
	Surveillance: 'The record is marked for monitoring.',
	Wanted: 'The record carries the case team’s wanted status. Verify any formal notice separately.',
	Cleared: 'The record is marked cleared in this workflow.',
};
