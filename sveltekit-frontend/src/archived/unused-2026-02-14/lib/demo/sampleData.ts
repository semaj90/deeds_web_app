/**
 * Demo Data Generator for Legal AI System Testing
 */

export interface DemoCase {
    id: string;
	title: string;
    description: string;
	status: 'active' | 'pending' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    createdAt: Date;
	updatedAt: Date;
    assignedTo?: string;
	tags: string[];
}

export interface DemoEvidence {
    id: string;
	caseId: string;
    title: string;
	description: string;
    type?: 'police_report' | 'witness_statement' | 'financial_records' | 'digital_forensics' | 'physical_evidence' | 'expert_testimony';
    status: 'new' | 'reviewing' | 'approved';
    content: string;
	uploadedAt: Date;
    fileSize: number;
	tags: string[];
}

export interface DemoPerson {
    id: string;
	name: string;
    role: 'suspect' | 'witness' | 'victim' | 'officer' | 'expert' | 'other';
    contactInfo: {
        phone?: string;
        email?: string;
        address?: string;
    };
    notes: string;
}

class DemoDataGenerator {
    private caseCounter = 1;
    private evidenceCounter = 1;
    private personCounter = 1;

    /**
     * Generate sample cases
     */
    generateCases(count: number = 5): DemoCase[] {
        const caseTemplates = [
            {
                title: 'State v. Johnson - Embezzlement Investigation',
                description: 'Corporate embezzlement investigation involving $2.3M in misappropriated funds. Multiple financial institutions affected.',
                priority: 'high' as const,
                tags: ['embezzlement', 'corporate', 'financial-crimes']
            },
	{
                title: 'People v. Martinez - Assault Case',
                description: 'Aggravated assault incident outside downtown restaurant. Multiple witnesses, security footage available.',
                priority: 'medium' as const,
                tags: ['assault', 'criminal', 'footage']
            },
	{
                title: 'Smith v. Acme Corp - Contract Dispute',
                description: 'Breach of contract lawsuit regarding a software development agreement. Damages sought: $1,000,000.',
                priority: 'low' as const,
                tags: ['contract', 'civil', 'software']
            },
	{
                title: 'Estate of Doe - Probate Litigation',
                description: 'Dispute over the will of a deceased individual. Family members contesting distribution of assets.',
                priority: 'urgent' as const,
                tags: ['probate', 'estate', 'litigation']
            },
	{
                title: 'Environmental Protection Agency v. GreenCo - Pollution Violation',
                description: 'Investigation into alleged toxic waste dumping by a manufacturing plant. Potential class-action lawsuit.',
                priority: 'high' as const,
                tags: ['environmental', 'pollution', 'corporate']
            }
        ];

        const cases: DemoCase[] = [];
        const statuses: DemoCase['status'][] = ['active', 'pending', 'closed'];
        const assignedToList = ['John Doe', 'Jane Smith', '']; // Empty string for unassigned

        for (let i = 0; i < count; i++) {
            const template = caseTemplates[this.caseCounter % caseTemplates.length];
            const now = new Date();
            // Generate creation date up to 30 days ago
            const createdAt = new Date(now.getTime() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000));
            // Generate update date up to 7 days after creation
            const updatedAt = new Date(createdAt.getTime() + Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000));

            cases.push({
                id: `case_${this.caseCounter++}`,
                title: template.title,
                description: template.description,
                status: statuses[Math.floor(Math.random() * statuses.length)],
                priority: template.priority,
                assignedTo: assignedToList[Math.floor(Math.random() * assignedToList.length)] || undefined,
                tags: template.tags,
                createdAt,
                updatedAt
            });
        }
        return cases;
    }
}

export default new DemoDataGenerator();
