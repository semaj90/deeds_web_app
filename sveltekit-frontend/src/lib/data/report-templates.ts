/**
 * Report Templates
 * Pre-built content templates for each report type
 * Used by the report creation wizard and AI generation
 */

export interface ReportTemplate {
  type: string;
  name: string;
  description: string;
  icon: string;
  defaultTitle: string;
  contentTemplate: string;
  aiPrompt: string;
  requiredFields: string[];
  estimatedTime: string;
}

export const REPORT_TEMPLATES: Record<string, ReportTemplate> = {
  charging_memo: {
    type: 'charging_memo',
    name: 'Charging Memorandum',
    description: 'Comprehensive analysis and recommendation for criminal charges',
    icon: 'scale',
    defaultTitle: 'Charging Memorandum - [Case Name]',
    contentTemplate: `
<h1>Charging Memorandum</h1>

<h2>Executive Summary</h2>
<p>This memorandum analyzes the evidence and provides charging recommendations for [Case Name].</p>

<h2>I. Facts and Background</h2>
<p>On [DATE], the following events occurred:</p>
<ul>
  <li>[Fact 1]</li>
  <li>[Fact 2]</li>
  <li>[Fact 3]</li>
</ul>

<h2>II. Applicable Law</h2>
<h3>A. Primary Statute</h3>
<p>[Statute citation and elements]</p>

<h3>B. Related Statutes</h3>
<p>[Additional relevant statutes]</p>

<h2>III. Analysis</h2>
<h3>A. Element 1</h3>
<p>[Analysis of whether evidence supports this element]</p>

<h3>B. Element 2</h3>
<p>[Analysis of whether evidence supports this element]</p>

<h2>IV. Potential Defenses</h2>
<p>[Anticipate and address potential defenses]</p>

<h2>V. Recommendation</h2>
<p><strong>Recommended Charge:</strong> [Specific charge]</p>
<p><strong>Legal Basis:</strong> [Statute and supporting evidence]</p>
<p><strong>Likelihood of Success:</strong> [High/Medium/Low]</p>

<h2>VI. Alternative Charges</h2>
<p>[Lesser included offenses or alternative theories]</p>

<h2>VII. Conclusion</h2>
<p>[Summary of recommendation and next steps]</p>
    `.trim(),
    aiPrompt: 'Generate a comprehensive charging memorandum analyzing the evidence and recommending appropriate criminal charges. Include legal analysis of each element, potential defenses, and likelihood of success at trial.',
    requiredFields: ['caseId', 'evidence', 'statutes'],
    estimatedTime: '15-20 minutes'
  },

  intake_summary: {
    type: 'intake_summary',
    name: 'Intake Summary',
    description: 'Initial case assessment and intake documentation',
    icon: 'file-text',
    defaultTitle: 'Case Intake Summary - [Case Name]',
    contentTemplate: `
<h1>Case Intake Summary</h1>

<h2>Case Information</h2>
<table>
  <tr><td><strong>Case Number:</strong></td><td>[CASE-####]</td></tr>
  <tr><td><strong>Intake Date:</strong></td><td>[DATE]</td></tr>
  <tr><td><strong>Assigned Attorney:</strong></td><td>[NAME]</td></tr>
  <tr><td><strong>Practice Area:</strong></td><td>[AREA]</td></tr>
</table>

<h2>Parties Involved</h2>
<h3>Complainant/Victim</h3>
<p>[Name, contact information, relationship to case]</p>

<h3>Defendant/Respondent</h3>
<p>[Name, contact information, known criminal history]</p>

<h3>Witnesses</h3>
<ul>
  <li>[Witness 1]</li>
  <li>[Witness 2]</li>
</ul>

<h2>Incident Summary</h2>
<p><strong>Date/Time of Incident:</strong> [DATE/TIME]</p>
<p><strong>Location:</strong> [ADDRESS]</p>
<p><strong>Brief Description:</strong></p>
<p>[2-3 paragraph summary of the incident]</p>

<h2>Evidence Collected</h2>
<ul>
  <li>📄 [Document type]</li>
  <li>📸 [Photo/video evidence]</li>
  <li>🔬 [Physical evidence]</li>
</ul>

<h2>Legal Issues Identified</h2>
<ol>
  <li>[Primary legal issue]</li>
  <li>[Secondary legal issue]</li>
  <li>[Procedural considerations]</li>
</ol>

<h2>Initial Assessment</h2>
<p><strong>Strength of Case:</strong> [Strong/Moderate/Weak]</p>
<p><strong>Jurisdictional Issues:</strong> [None identified / Details]</p>
<p><strong>Statute of Limitations:</strong> [Deadline date]</p>

<h2>Recommended Next Steps</h2>
<ol>
  <li>[Immediate action required]</li>
  <li>[Investigation needed]</li>
  <li>[Documents to request]</li>
  <li>[Interviews to schedule]</li>
</ol>

<h2>Notes</h2>
<p>[Additional observations or concerns]</p>
    `.trim(),
    aiPrompt: 'Generate an intake summary documenting the initial case assessment, parties involved, incident details, and recommended next steps.',
    requiredFields: ['caseId', 'incidentDate', 'parties'],
    estimatedTime: '10-15 minutes'
  },

  discovery_list: {
    type: 'discovery_list',
    name: 'Discovery List',
    description: 'Comprehensive list of discovery materials and requests',
    icon: 'list',
    defaultTitle: 'Discovery List - [Case Name]',
    contentTemplate: `
<h1>Discovery List</h1>

<h2>Case Information</h2>
<p><strong>Case:</strong> [Case Name]</p>
<p><strong>Date Prepared:</strong> [DATE]</p>

<h2>Documents Received</h2>
<h3>From Prosecution/Plaintiff</h3>
<table>
  <thead>
    <tr>
      <th>Item #</th>
      <th>Description</th>
      <th>Date Received</th>
      <th>Reviewed</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>001</td>
      <td>[Document description]</td>
      <td>[DATE]</td>
      <td>☐</td>
    </tr>
  </tbody>
</table>

<h3>From Defense/Defendant</h3>
<table>
  <thead>
    <tr>
      <th>Item #</th>
      <th>Description</th>
      <th>Date Received</th>
      <th>Reviewed</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>D-001</td>
      <td>[Document description]</td>
      <td>[DATE]</td>
      <td>☐</td>
    </tr>
  </tbody>
</table>

<h2>Outstanding Discovery Requests</h2>
<h3>Pending from Prosecution</h3>
<ul>
  <li>☐ [Item requested] - Due: [DATE]</li>
  <li>☐ [Item requested] - Due: [DATE]</li>
</ul>

<h3>Pending from Defense</h3>
<ul>
  <li>☐ [Item requested] - Due: [DATE]</li>
  <li>☐ [Item requested] - Due: [DATE]</li>
</ul>

<h2>Physical Evidence</h2>
<table>
  <thead>
    <tr>
      <th>Evidence #</th>
      <th>Description</th>
      <th>Location</th>
      <th>Chain of Custody</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>E-001</td>
      <td>[Evidence description]</td>
      <td>[Storage location]</td>
      <td>☐ Verified</td>
    </tr>
  </tbody>
</table>

<h2>Expert Reports</h2>
<ul>
  <li>☐ [Expert name] - [Type of analysis] - Expected: [DATE]</li>
</ul>

<h2>Witness Statements</h2>
<ul>
  <li>☐ [Witness name] - Statement dated [DATE]</li>
</ul>

<h2>Discovery Status Summary</h2>
<p><strong>Total Items Received:</strong> [NUMBER]</p>
<p><strong>Total Items Outstanding:</strong> [NUMBER]</p>
<p><strong>Discovery Deadline:</strong> [DATE]</p>
<p><strong>Days Remaining:</strong> [NUMBER]</p>
    `.trim(),
    aiPrompt: 'Generate a comprehensive discovery list documenting all materials received, outstanding requests, and tracking status.',
    requiredFields: ['caseId'],
    estimatedTime: '20-30 minutes'
  },

  hearing_prep: {
    type: 'hearing_prep',
    name: 'Hearing Preparation',
    description: 'Pre-hearing checklist and strategy outline',
    icon: 'clipboard-check',
    defaultTitle: 'Hearing Preparation - [Hearing Type]',
    contentTemplate: `
<h1>Hearing Preparation Checklist</h1>

<h2>Hearing Details</h2>
<table>
  <tr><td><strong>Case:</strong></td><td>[Case Name]</td></tr>
  <tr><td><strong>Hearing Type:</strong></td><td>[Type]</td></tr>
  <tr><td><strong>Date/Time:</strong></td><td>[DATE/TIME]</td></tr>
  <tr><td><strong>Location:</strong></td><td>[COURTROOM]</td></tr>
  <tr><td><strong>Judge:</strong></td><td>[NAME]</td></tr>
</table>

<h2>Issues to be Addressed</h2>
<ol>
  <li>[Primary issue]</li>
  <li>[Secondary issue]</li>
  <li>[Additional issues]</li>
</ol>

<h2>Legal Arguments</h2>
<h3>Our Position</h3>
<p><strong>Primary Argument:</strong> [Argument]</p>
<p><strong>Legal Basis:</strong> [Statute/Case law]</p>
<p><strong>Supporting Evidence:</strong></p>
<ul>
  <li>[Evidence item 1]</li>
  <li>[Evidence item 2]</li>
</ul>

<h3>Anticipated Opposition Arguments</h3>
<p>[Expected arguments from opposing counsel]</p>
<p><strong>Our Response:</strong> [Rebuttal strategy]</p>

<h2>Witnesses</h2>
<h3>Our Witnesses</h3>
<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Purpose</th>
      <th>Confirmed</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>[NAME]</td>
      <td>[Testimony purpose]</td>
      <td>☐</td>
    </tr>
  </tbody>
</table>

<h3>Key Questions to Ask</h3>
<ul>
  <li>[Question 1]</li>
  <li>[Question 2]</li>
</ul>

<h2>Exhibits</h2>
<table>
  <thead>
    <tr>
      <th>Exhibit</th>
      <th>Description</th>
      <th>Purpose</th>
      <th>Ready</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>A</td>
      <td>[Document]</td>
      <td>[Why needed]</td>
      <td>☐</td>
    </tr>
  </tbody>
</table>

<h2>Pre-Hearing Checklist</h2>
<ul>
  <li>☐ File pre-hearing brief (Due: [DATE])</li>
  <li>☐ Serve opposing counsel</li>
  <li>☐ Confirm witness availability</li>
  <li>☐ Prepare exhibit binders</li>
  <li>☐ Review case law</li>
  <li>☐ Prepare opening statement</li>
  <li>☐ Brief client on procedure</li>
  <li>☐ Arrive 30 minutes early</li>
</ul>

<h2>Desired Outcome</h2>
<p><strong>Primary Goal:</strong> [What we're seeking]</p>
<p><strong>Acceptable Alternative:</strong> [Fallback position]</p>

<h2>Notes</h2>
<p>[Strategic considerations, judge's tendencies, etc.]</p>
    `.trim(),
    aiPrompt: 'Generate a comprehensive hearing preparation checklist including legal arguments, witness preparation, exhibits, and procedural requirements.',
    requiredFields: ['caseId', 'hearingType', 'hearingDate'],
    estimatedTime: '30-45 minutes'
  },

  analysis: {
    type: 'analysis',
    name: 'Case Analysis',
    description: 'In-depth legal and factual analysis',
    icon: 'search',
    defaultTitle: 'Case Analysis - [Topic]',
    contentTemplate: `
<h1>Case Analysis</h1>

<h2>Executive Summary</h2>
<p>[2-3 sentence overview of analysis findings]</p>

<h2>Issue Presented</h2>
<p>[Precise legal question being analyzed]</p>

<h2>Brief Answer</h2>
<p>[Concise answer to the issue]</p>

<h2>Facts</h2>
<p>[Relevant facts organized chronologically or topically]</p>

<h2>Applicable Law</h2>
<h3>Statutory Framework</h3>
<p>[Relevant statutes with citations]</p>

<h3>Case Law</h3>
<p><strong>[Case Name], [Citation]</strong></p>
<p>[Holding and relevance]</p>

<h2>Analysis</h2>
<h3>Arguments Supporting [Position]</h3>
<ol>
  <li><strong>[Argument 1]</strong>
    <p>[Detailed analysis with legal support]</p>
  </li>
  <li><strong>[Argument 2]</strong>
    <p>[Detailed analysis with legal support]</p>
  </li>
</ol>

<h3>Counter-Arguments</h3>
<ol>
  <li><strong>[Counter-argument 1]</strong>
    <p>[Analysis and our response]</p>
  </li>
</ol>

<h2>Conclusion</h2>
<p>[Synthesis of analysis and final conclusion]</p>

<h2>Recommendations</h2>
<ol>
  <li>[Recommended action 1]</li>
  <li>[Recommended action 2]</li>
</ol>
    `.trim(),
    aiPrompt: 'Generate a comprehensive legal analysis examining the issue from multiple perspectives with supporting case law and statutory interpretation.',
    requiredFields: ['caseId', 'legalIssue'],
    estimatedTime: '45-60 minutes'
  },

  summary: {
    type: 'summary',
    name: 'Case Summary',
    description: 'Concise overview of case status and key information',
    icon: 'file-text',
    defaultTitle: 'Case Summary - [Case Name]',
    contentTemplate: `
<h1>Case Summary</h1>

<h2>Case Overview</h2>
<table>
  <tr><td><strong>Case Name:</strong></td><td>[TITLE]</td></tr>
  <tr><td><strong>Case Number:</strong></td><td>[NUMBER]</td></tr>
  <tr><td><strong>Filed:</strong></td><td>[DATE]</td></tr>
  <tr><td><strong>Status:</strong></td><td>[ACTIVE/PENDING/CLOSED]</td></tr>
  <tr><td><strong>Next Hearing:</strong></td><td>[DATE]</td></tr>
</table>

<h2>Parties</h2>
<p><strong>Plaintiff/Complainant:</strong> [NAME]</p>
<p><strong>Defendant/Respondent:</strong> [NAME]</p>
<p><strong>Counsel:</strong> [NAMES]</p>

<h2>Case Synopsis</h2>
<p>[Brief 1-2 paragraph description of the case]</p>

<h2>Key Facts</h2>
<ul>
  <li>[Fact 1]</li>
  <li>[Fact 2]</li>
  <li>[Fact 3]</li>
</ul>

<h2>Legal Issues</h2>
<ol>
  <li>[Issue 1]</li>
  <li>[Issue 2]</li>
</ol>

<h2>Case Timeline</h2>
<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Event</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>[DATE]</td>
      <td>[Event description]</td>
    </tr>
  </tbody>
</table>

<h2>Current Status</h2>
<p>[Current procedural posture and what's happening next]</p>

<h2>Pending Matters</h2>
<ul>
  <li>☐ [Pending item 1]</li>
  <li>☐ [Pending item 2]</li>
</ul>
    `.trim(),
    aiPrompt: 'Generate a concise case summary highlighting key facts, legal issues, and current status.',
    requiredFields: ['caseId'],
    estimatedTime: '10-15 minutes'
  },

  timeline: {
    type: 'timeline',
    name: 'Case Timeline',
    description: 'Chronological timeline of case events',
    icon: 'calendar',
    defaultTitle: 'Timeline - [Case Name]',
    contentTemplate: `
<h1>Case Timeline</h1>

<h2>Chronological Events</h2>

<h3>[YEAR] - Pre-Incident Events</h3>
<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Event</th>
      <th>Source</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>[DATE]</td>
      <td>[Event description]</td>
      <td>[Evidence reference]</td>
    </tr>
  </tbody>
</table>

<h3>[YEAR] - Incident and Investigation</h3>
<table>
  <thead>
    <tr>
      <th>Date/Time</th>
      <th>Event</th>
      <th>Source</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>[DATE/TIME]</td>
      <td>[Event description]</td>
      <td>[Evidence reference]</td>
    </tr>
  </tbody>
</table>

<h3>[YEAR] - Legal Proceedings</h3>
<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Proceeding</th>
      <th>Outcome</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>[DATE]</td>
      <td>[Court event]</td>
      <td>[Result]</td>
    </tr>
  </tbody>
</table>

<h2>Key Dates Summary</h2>
<ul>
  <li><strong>Incident Date:</strong> [DATE]</li>
  <li><strong>Report Filed:</strong> [DATE]</li>
  <li><strong>Charges Filed:</strong> [DATE]</li>
  <li><strong>Arraignment:</strong> [DATE]</li>
  <li><strong>Discovery Deadline:</strong> [DATE]</li>
  <li><strong>Trial Date:</strong> [DATE]</li>
</ul>

<h2>Timeline Gaps</h2>
<p>[Note any missing information or unexplained time periods]</p>
    `.trim(),
    aiPrompt: 'Generate a detailed chronological timeline of all case events with supporting evidence references.',
    requiredFields: ['caseId', 'evidence'],
    estimatedTime: '20-30 minutes'
  },

  evidence_review: {
    type: 'evidence_review',
    name: 'Evidence Review',
    description: 'Comprehensive review and analysis of evidence',
    icon: 'folder-search',
    defaultTitle: 'Evidence Review - [Case Name]',
    contentTemplate: `
<h1>Evidence Review</h1>

<h2>Evidence Summary</h2>
<p><strong>Total Items:</strong> [NUMBER]</p>
<p><strong>Review Date:</strong> [DATE]</p>
<p><strong>Reviewed By:</strong> [NAME]</p>

<h2>Documentary Evidence</h2>
<h3>Critical Documents</h3>
<table>
  <thead>
    <tr>
      <th>Item #</th>
      <th>Description</th>
      <th>Relevance</th>
      <th>Authentication</th>
      <th>Issues</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>DOC-001</td>
      <td>[Description]</td>
      <td>[Why important]</td>
      <td>☐ Verified</td>
      <td>[Concerns]</td>
    </tr>
  </tbody>
</table>

<h2>Physical Evidence</h2>
<table>
  <thead>
    <tr>
      <th>Item #</th>
      <th>Description</th>
      <th>Condition</th>
      <th>Chain of Custody</th>
      <th>Testing</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>PHYS-001</td>
      <td>[Description]</td>
      <td>[Condition]</td>
      <td>☐ Complete</td>
      <td>[Tests performed]</td>
    </tr>
  </tbody>
</table>

<h2>Digital Evidence</h2>
<table>
  <thead>
    <tr>
      <th>Item #</th>
      <th>Type</th>
      <th>Source</th>
      <th>Forensic Analysis</th>
      <th>Admissibility</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>DIG-001</td>
      <td>[Type]</td>
      <td>[Source]</td>
      <td>[Analysis status]</td>
      <td>[Assessment]</td>
    </tr>
  </tbody>
</table>

<h2>Witness Testimony Evidence</h2>
<h3>Testimonial Evidence Summary</h3>
<ul>
  <li><strong>[Witness Name]:</strong> [Key testimony points]</li>
</ul>

<h2>Expert Evidence</h2>
<table>
  <thead>
    <tr>
      <th>Expert</th>
      <th>Specialty</th>
      <th>Opinion</th>
      <th>Basis</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>[NAME]</td>
      <td>[Field]</td>
      <td>[Opinion]</td>
      <td>[Evidence relied upon]</td>
    </tr>
  </tbody>
</table>

<h2>Evidence Gaps</h2>
<ul>
  <li>[Missing evidence item 1]</li>
  <li>[Missing evidence item 2]</li>
</ul>

<h2>Admissibility Issues</h2>
<h3>Potential Challenges</h3>
<ul>
  <li>[Issue 1 and legal basis]</li>
  <li>[Issue 2 and legal basis]</li>
</ul>

<h2>Evidence Strengths</h2>
<ol>
  <li>[Strong evidence item and why]</li>
  <li>[Strong evidence item and why]</li>
</ol>

<h2>Evidence Weaknesses</h2>
<ol>
  <li>[Weak evidence item and concerns]</li>
  <li>[Weak evidence item and concerns]</li>
</ol>

<h2>Recommendations</h2>
<ul>
  <li>[Recommendation 1]</li>
  <li>[Recommendation 2]</li>
</ul>
    `.trim(),
    aiPrompt: 'Generate a comprehensive evidence review analyzing all evidence items, identifying strengths, weaknesses, and admissibility issues.',
    requiredFields: ['caseId', 'evidence'],
    estimatedTime: '30-45 minutes'
  },

  legal_memo: {
    type: 'legal_memo',
    name: 'Legal Memorandum',
    description: 'Formal legal research memorandum',
    icon: 'book-open',
    defaultTitle: 'Legal Memorandum - [Issue]',
    contentTemplate: `
<h1>Legal Memorandum</h1>

<table>
  <tr><td><strong>TO:</strong></td><td>[RECIPIENT]</td></tr>
  <tr><td><strong>FROM:</strong></td><td>[AUTHOR]</td></tr>
  <tr><td><strong>DATE:</strong></td><td>[DATE]</td></tr>
  <tr><td><strong>RE:</strong></td><td>[SUBJECT]</td></tr>
</table>

<hr>

<h2>Question Presented</h2>
<p>[Precise legal question in yes/no format]</p>

<h2>Brief Answer</h2>
<p>[Concise answer with brief reasoning]</p>

<h2>Statement of Facts</h2>
<p>[Relevant facts organized logically]</p>

<h2>Discussion</h2>

<h3>I. [First Major Issue]</h3>
<p><strong>A. Applicable Legal Standard</strong></p>
<p>[Statement of the rule with citations]</p>

<p><strong>B. Application</strong></p>
<p>[Apply law to facts]</p>

<p><strong>C. Analysis</strong></p>
<p>[Detailed analysis with case comparisons]</p>

<h3>II. [Second Major Issue]</h3>
<p><strong>A. Applicable Legal Standard</strong></p>
<p>[Statement of the rule with citations]</p>

<p><strong>B. Application</strong></p>
<p>[Apply law to facts]</p>

<p><strong>C. Analysis</strong></p>
<p>[Detailed analysis with case comparisons]</p>

<h2>Counter-Arguments</h2>
<p>[Address opposing viewpoints]</p>

<h2>Conclusion</h2>
<p>[Restate conclusion with supporting reasoning]</p>

<hr>

<h2>Authorities Cited</h2>
<h3>Cases</h3>
<ul>
  <li>[Case Name], [Citation]</li>
</ul>

<h3>Statutes</h3>
<ul>
  <li>[Statute citation]</li>
</ul>

<h3>Secondary Sources</h3>
<ul>
  <li>[Treatise, article, etc.]</li>
</ul>
    `.trim(),
    aiPrompt: 'Generate a formal legal memorandum with IRAC structure, comprehensive legal analysis, and proper citations.',
    requiredFields: ['legalIssue', 'jurisdiction'],
    estimatedTime: '60-90 minutes'
  },

  custom: {
    type: 'custom',
    name: 'Custom Report',
    description: 'Create a custom report from scratch',
    icon: 'file-plus',
    defaultTitle: 'Custom Report',
    contentTemplate: `
<h1>Custom Report</h1>

<p>Start writing your custom report here...</p>
    `.trim(),
    aiPrompt: 'Generate a custom report based on the user\'s specific requirements and case context.',
    requiredFields: [],
    estimatedTime: 'Variable'
  }
};

/**
 * Get a template by type
 */
export function getTemplate(type: string): ReportTemplate | null {
  return REPORT_TEMPLATES[type] || null;
}

/**
 * Get all templates as an array
 */
export function getAllTemplates(): ReportTemplate[] {
  return Object.values(REPORT_TEMPLATES);
}

/**
 * Get template types for the creation wizard
 */
export function getTemplateTypes() {
  return Object.values(REPORT_TEMPLATES).map(t => ({
    value: t.type,
    label: t.name,
    description: t.description,
    icon: t.icon
  }));
}
