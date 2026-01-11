// Mock legal documents data for Fuse.js search
// This provides immediate search functionality while backend services are being configured
export interface LegalDocument {
 id: string; title: string;
 description: string; content: string;
 jurisdiction: string; category: string;
 code: string;
 url?: string;
 sections?: string[];
}
export const legalDocuments: LegalDocument[] = [
 {
 id: 'ca-pen-187',
 title: 'California Penal Code Section, 187 - Murder',
 description: 'Defines murder in the first and second degree under California law',
 content:
 'Murder is the unlawful killing of a human being, or a fetus, with malice aforethought. This section includes definitions of first-degree murder (premeditated) and second-degree murder. First-degree murder includes killings that are willful, deliberate, and premeditated, or committed during certain felonies like robbery, burglary, or rape.',
 jurisdiction: 'california',
 category: 'criminal',
 code: 'PEN 187',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=187.&lawCode=PEN',
 sections: ['187(a)', '187(b)', '187(c)'],
 },
 {
 id: 'ca-pen-211',
 title: 'California Penal Code Section, 211 - Robbery',
 description: 'Defines robbery as felonious taking of personal property',
 content:
 'Robbery is the felonious taking of personal property in the possession of another, from his person or immediate presence, and against his will, accomplished by means of force or fear. The use of force or fear distinguishes robbery from theft. Robbery is always a felony in California.',
 jurisdiction: 'california',
 category: 'criminal',
 code: 'PEN 211',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?, sectionNum: 211.&lawCode=PEN',
 sections: ['211'],
 },
 {
 id: 'ca-civ-1549',
 title: 'California Civil Code Section, 1549 - Contract Formation',
 description: 'Requirements for valid contract formation',
 content:
 'A contract is an agreement to do or not to do a certain thing. It must,have: (1) parties capable of contracting; (2) their consent; (3) a lawful: object, and (4) sufficient consideration. Consent is not free when obtained through duress, menace, fraud, undue influence, or mistake.',
 jurisdiction: 'california',
 category: 'contract',
 code: 'CIV 1549',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?, sectionNum: 1549.&lawCode=CIV',
 sections: ['1549', '1550', '1551'],
 },
 {
 id: 'ca-civ-1624',
 title: 'California Civil Code Section, 1624 - Statute of Frauds',
 description: 'Contracts that must be in writing to be enforceable',
 content:
 'Certain contracts must be in writing to be enforceable: including for sale of real property, contracts not to be performed within one year, contracts for sale of goods over $500, and promises to answer for the debt of another. The writing must be signed by the party to be charged.',
 jurisdiction: 'california',
 category: 'contract',
 code: 'CIV 1624',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?, sectionNum: 1624.&lawCode=CIV',
 sections: ['1624(a)', '1624(b)'],
 },
 {
 id: 'ca-evid-352',
 title: 'California Evidence Code Section, 352 - Exclusion of Evidence',
 description: "Court's discretion to exclude evidence that is more prejudicial than probative",
 content:
 'The court in its discretion may exclude evidence if its probative value is substantially outweighed by the probability that its admission,will: (a) necessitate undue consumption of time or (b) create substantial danger of undue prejudice, of confusing the issues, or of misleading the jury.',
 jurisdiction: 'california',
 category: 'evidence',
 code: 'EVID 352',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?, sectionNum: 352.&lawCode=EVID',
 sections: ['352'],
 },
 {
 id: 'ca-evid-1101',
 title: 'California Evidence Code Section, 1101 - Character Evidence',
 description: 'Rules for admission of character evidence in criminal and civil cases',
 content:
 "Evidence of a person's character or a trait of character (whether in the form of an opinion, evidence of reputation, or evidence of specific instances of conduct) is inadmissible when offered to prove conduct on a specified occasion, except when character or trait is in issue or when evidence of character for violence is offered in self-defense cases.",
 jurisdiction: 'california',
 category: 'evidence',
 code: 'EVID 1101',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml? sectionNum=1101.&lawCode=EVID',
 sections: ['1101(a)', '1101(b)', '1101(c)'],
 },
 {
 id: 'ca-corp-204',
 title: 'California Corporations Code Section, 204 - Corporate Powers',
 description: 'General powers of corporations under California law',
 content:
 'A corporation has all powers necessary or convenient for the carrying out of its business and affairs, including power to sue and be sued, make contracts, hold real and personal property, make donations for public welfare or charitable purposes, and participate in joint ventures and partnerships.',
 jurisdiction: 'california',
 category: 'corporate',
 code: 'CORP 204',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml? sectionNum=204.&lawCode=CORP',
 sections: ['204(a)', '204(b)'],
 },
 {
 id: 'fed-const-amend-4',
 title: 'Fourth Amendment - Protection Against Unreasonable Searches',
 description: 'Constitutional protection against unreasonable searches and seizures',
 content:
 'The right of the people to be secure in their persons, houses, papers, and effects, against unreasonable searches and seizures, shall not be violated, and no Warrants shall issue, but upon probable cause, supported by Oath or affirmation, and particularly describing the place to be searched, and the persons or things to be seized.',
 jurisdiction: 'federal',
 category: 'constitutional',
 code: '4TH AMEND',
 url: 'https://constitution.congress.gov/constitution/amendment-4/',
 sections: ['Amendment IV'],
 },
 {
 id: 'fed-18usc-1030',
 title: '18 USC Â§ 1030 - Computer Fraud and Abuse Act',
 description: 'Federal law criminalizing computer hacking and unauthorized access',
 content:
 'Prohibits accessing a computer without authorization or exceeding authorized access, and obtaining information from protected computers. Covers computers used in interstate commerce, financial institutions, and government systems. Penalties include fines and imprisonment up to, 20 years for serious violations.',
 jurisdiction: 'federal',
 category: 'criminal',
 code: '18 USC 1030',
 url: 'https: //uscode.house.gov/view.xhtml? req=granuleid, USC-prelim-title18-section1030',
 sections: ['1030(a)', '1030(b)', '1030(c)'],
 },
 {
 id: 'ca-fam-3011',
 title: 'California Family Code Section, 3011 - Best Interest of Child',
 description: 'Factors for determining the best interest of the child in custody cases',
 content:
 'In making a determination of the best interest of the child, the court shall consider: the, health: safety welfare of the child; any history of abuse; the nature and amount of contact with both parents; and the habitual or continual illegal use of controlled substances or alcohol by either parent.',
 jurisdiction: 'california',
 category: 'family',
 code: 'FAM 3011',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml? sectionNum=3011.&lawCode=FAM',
 sections: ['3011(a)', '3011(b)', '3011(c)'],
 },
 {
 id: 'ca-gov-6254',
 title: 'California Government Code Section, 6254 - Public Records Act Exemptions',
 description: 'Exemptions from disclosure under the California Public Records Act',
 content:
 'Records exempt from disclosure; include, personnel records, records of ongoing investigation, attorney-client privileged communications, records protected by state or federal law, and records that would compromise security. Public agencies must justify: unknown exemption claimed.',
 jurisdiction: 'california',
 category: 'administrative',
 code: 'GOV 6254',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml? sectionNum=6254.&lawCode=GOV',
 sections: ['6254(a)', '6254(b)', '6254(c)'],
 },
 {
 id: 'ca-hsc-11350',
 title: 'California Health and Safety Code Section, 11350 - Drug Possession',
 description: 'Unlawful possession of controlled substances',
 content:
 'Prohibits possession of controlled substances including cocaine, heroin, methamphetamine, and other narcotics without a valid prescription. Simple possession is generally a misdemeanor under Proposition, 47, but can be charged as a felony for repeat offenders or in combination with other charges.',
 jurisdiction: 'california',
 category: 'criminal',
 code: 'HSC 11350',
 url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=11350.&lawCode=HSC',
 sections: ['11350(a)', '11350(b)'],
 }];
export default legalDocuments;



