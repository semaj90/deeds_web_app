/**
 * Document Templates API
 * GET /api/ai/document-drafting/templates - Get available document templates
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const documentType = url.searchParams.get('type');
    
    const allTemplates = [
      {
        id: 'motion_suppress_standard',
        name: 'Standard Motion to Suppress',
        documentTypeId: 'motion_to_suppress',
        description: 'Standard format motion to suppress evidence based on Fourth Amendment violations',
        content: `IN THE UNITED STATES DISTRICT COURT
FOR THE {{DISTRICT}}

UNITED STATES OF AMERICA,
                                    Plaintiff,
v.                                    Case No. {{CASE_NUMBER}}
{{DEFENDANT_NAME}},
                                    Defendant.

MOTION TO SUPPRESS EVIDENCE

TO THE HONORABLE COURT:

Defendant {{DEFENDANT_NAME}}, by and through undersigned counsel, respectfully moves this Honorable Court to suppress evidence obtained in violation of the Fourth Amendment to the United States Constitution.

I. INTRODUCTION

{{CASE_CONTEXT}}

II. FACTUAL BACKGROUND

{{FACTUAL_BACKGROUND}}

III. LEGAL STANDARD

{{LEGAL_STANDARD}}

IV. ARGUMENT

{{ARGUMENT_SECTIONS}}

V. CONCLUSION

For the foregoing reasons, Defendant respectfully requests that this Honorable Court grant this Motion to Suppress Evidence.

Respectfully submitted,

{{ATTORNEY_SIGNATURE}}`,
        variables: [
          { name: 'DISTRICT', type: 'text', required: true, description: 'Court district' },
          { name: 'CASE_NUMBER', type: 'text', required: true, description: 'Case number' },
          { name: 'DEFENDANT_NAME', type: 'text', required: true, description: 'Defendant name' },
          { name: 'CASE_CONTEXT', type: 'textarea', required: true, description: 'Case context and summary' },
          { name: 'FACTUAL_BACKGROUND', type: 'textarea', required: true, description: 'Factual background' },
          { name: 'LEGAL_STANDARD', type: 'textarea', required: false, description: 'Applicable legal standard' },
          { name: 'ARGUMENT_SECTIONS', type: 'textarea', required: true, description: 'Legal arguments' },
          { name: 'ATTORNEY_SIGNATURE', type: 'text', required: true, description: 'Attorney signature block' }
        ],
        lastUpdated: '2024-09-10T15:00:00Z',
        usage_count: 127
      },
      {
        id: 'plea_agreement_standard',
        name: 'Standard Plea Agreement',
        documentTypeId: 'plea_agreement',
        description: 'Comprehensive plea agreement template with standard terms',
        content: `PLEA AGREEMENT

Case No. {{CASE_NUMBER}}
United States v. {{DEFENDANT_NAME}}

The United States of America, by and through its attorney, {{PROSECUTOR_NAME}}, and the defendant, {{DEFENDANT_NAME}}, by and through defense counsel, {{DEFENSE_ATTORNEY}}, hereby enter into the following plea agreement:

1. CHARGES AND PLEA

{{CHARGES_SECTION}}

2. SENTENCING GUIDELINES

{{GUIDELINES_SECTION}}

3. COOPERATION

{{COOPERATION_TERMS}}

4. WAIVERS

{{WAIVER_PROVISIONS}}

5. BREACH PROVISIONS

{{BREACH_TERMS}}

AGREED TO AND ACCEPTED:

{{SIGNATURE_BLOCK}}`,
        variables: [
          { name: 'CASE_NUMBER', type: 'text', required: true, description: 'Case number' },
          { name: 'DEFENDANT_NAME', type: 'text', required: true, description: 'Defendant name' },
          { name: 'PROSECUTOR_NAME', type: 'text', required: true, description: 'Prosecutor name' },
          { name: 'DEFENSE_ATTORNEY', type: 'text', required: true, description: 'Defense attorney name' },
          { name: 'CHARGES_SECTION', type: 'textarea', required: true, description: 'Charges and plea details' },
          { name: 'GUIDELINES_SECTION', type: 'textarea', required: false, description: 'Sentencing guidelines' },
          { name: 'COOPERATION_TERMS', type: 'textarea', required: false, description: 'Cooperation agreement' },
          { name: 'WAIVER_PROVISIONS', type: 'textarea', required: true, description: 'Rights waived' },
          { name: 'BREACH_TERMS', type: 'textarea', required: false, description: 'Breach consequences' },
          { name: 'SIGNATURE_BLOCK', type: 'text', required: true, description: 'Signature block' }
        ],
        lastUpdated: '2024-09-08T10:30:00Z',
        usage_count: 89
      },
      {
        id: 'discovery_standard',
        name: 'Standard Discovery Request',
        documentTypeId: 'discovery_request',
        description: 'Comprehensive discovery request for criminal cases',
        content: `DISCOVERY REQUEST

TO: {{PROSECUTOR_NAME}}
FROM: {{DEFENSE_ATTORNEY}}
RE: {{CASE_TITLE}}
DATE: {{DATE}}

Pursuant to Federal Rule of Criminal Procedure 16 and Brady v. Maryland, the defense hereby requests the following discovery:

I. RULE 16 MATERIALS

{{RULE_16_REQUESTS}}

II. BRADY MATERIALS

{{BRADY_REQUESTS}}

III. GIGLIO MATERIALS

{{GIGLIO_REQUESTS}}

IV. EXPERT WITNESS MATERIALS

{{EXPERT_REQUESTS}}

V. ELECTRONIC EVIDENCE

{{ELECTRONIC_REQUESTS}}

Please provide the requested materials within 30 days of this request.

Respectfully submitted,

{{ATTORNEY_SIGNATURE}}`,
        variables: [
          { name: 'PROSECUTOR_NAME', type: 'text', required: true, description: 'Prosecutor name' },
          { name: 'DEFENSE_ATTORNEY', type: 'text', required: true, description: 'Defense attorney name' },
          { name: 'CASE_TITLE', type: 'text', required: true, description: 'Case title' },
          { name: 'DATE', type: 'date', required: true, description: 'Request date' },
          { name: 'RULE_16_REQUESTS', type: 'textarea', required: true, description: 'Rule 16 discovery requests' },
          { name: 'BRADY_REQUESTS', type: 'textarea', required: true, description: 'Brady material requests' },
          { name: 'GIGLIO_REQUESTS', type: 'textarea', required: false, description: 'Giglio material requests' },
          { name: 'EXPERT_REQUESTS', type: 'textarea', required: false, description: 'Expert witness materials' },
          { name: 'ELECTRONIC_REQUESTS', type: 'textarea', required: false, description: 'Electronic evidence requests' },
          { name: 'ATTORNEY_SIGNATURE', type: 'text', required: true, description: 'Attorney signature block' }
        ],
        lastUpdated: '2024-09-05T16:45:00Z',
        usage_count: 203
      },
      {
        id: 'opening_criminal',
        name: 'Criminal Opening Statement',
        documentTypeId: 'opening_statement',
        description: 'Opening statement template for criminal defense',
        content: `OPENING STATEMENT

Case: {{CASE_TITLE}}
Defendant: {{DEFENDANT_NAME}}

May it please the Court, counsel, and members of the jury:

{{INTRODUCTION}}

I. CASE THEME

{{CASE_THEME}}

II. WHAT THE EVIDENCE WILL SHOW

{{EVIDENCE_PREVIEW}}

III. THE GOVERNMENT'S BURDEN

{{BURDEN_DISCUSSION}}

IV. KEY FACTS

{{KEY_FACTS}}

V. CONCLUSION

{{CONCLUSION}}

Thank you for your attention.`,
        variables: [
          { name: 'CASE_TITLE', type: 'text', required: true, description: 'Case title' },
          { name: 'DEFENDANT_NAME', type: 'text', required: true, description: 'Defendant name' },
          { name: 'INTRODUCTION', type: 'textarea', required: true, description: 'Opening introduction' },
          { name: 'CASE_THEME', type: 'textarea', required: true, description: 'Central case theme' },
          { name: 'EVIDENCE_PREVIEW', type: 'textarea', required: true, description: 'Evidence preview' },
          { name: 'BURDEN_DISCUSSION', type: 'textarea', required: true, description: 'Burden of proof discussion' },
          { name: 'KEY_FACTS', type: 'textarea', required: true, description: 'Key facts presentation' },
          { name: 'CONCLUSION', type: 'textarea', required: true, description: 'Opening conclusion' }
        ],
        lastUpdated: '2024-09-07T11:20:00Z',
        usage_count: 156
      },
      {
        id: 'sentencing_mitigation',
        name: 'Sentencing Memorandum - Mitigation',
        documentTypeId: 'sentencing_memo',
        description: 'Sentencing memorandum focused on mitigation factors',
        content: `SENTENCING MEMORANDUM

Case No. {{CASE_NUMBER}}
United States v. {{DEFENDANT_NAME}}

TO THE HONORABLE COURT:

Defense respectfully submits this sentencing memorandum on behalf of {{DEFENDANT_NAME}}.

I. INTRODUCTION

{{INTRODUCTION}}

II. OFFENSE CONDUCT

{{OFFENSE_CONDUCT}}

III. PERSONAL HISTORY AND CHARACTERISTICS

{{PERSONAL_HISTORY}}

IV. MITIGATION FACTORS

{{MITIGATION_FACTORS}}

V. SENTENCING FACTORS (18 U.S.C. § 3553(a))

{{SENTENCING_FACTORS}}

VI. REQUEST FOR DEPARTURE

{{DEPARTURE_REQUEST}}

VII. CONCLUSION

{{CONCLUSION}}

Respectfully submitted,

{{ATTORNEY_SIGNATURE}}`,
        variables: [
          { name: 'CASE_NUMBER', type: 'text', required: true, description: 'Case number' },
          { name: 'DEFENDANT_NAME', type: 'text', required: true, description: 'Defendant name' },
          { name: 'INTRODUCTION', type: 'textarea', required: true, description: 'Introduction and summary' },
          { name: 'OFFENSE_CONDUCT', type: 'textarea', required: true, description: 'Offense conduct description' },
          { name: 'PERSONAL_HISTORY', type: 'textarea', required: true, description: 'Personal history and characteristics' },
          { name: 'MITIGATION_FACTORS', type: 'textarea', required: true, description: 'Mitigation factors' },
          { name: 'SENTENCING_FACTORS', type: 'textarea', required: true, description: '3553(a) factors analysis' },
          { name: 'DEPARTURE_REQUEST', type: 'textarea', required: false, description: 'Departure request if applicable' },
          { name: 'CONCLUSION', type: 'textarea', required: true, description: 'Conclusion and sentence request' },
          { name: 'ATTORNEY_SIGNATURE', type: 'text', required: true, description: 'Attorney signature block' }
        ],
        lastUpdated: '2024-09-06T14:15:00Z',
        usage_count: 94
      }
    ];

    // Filter by document type if specified
    const templates = documentType 
      ? allTemplates.filter(template => template.documentTypeId === documentType)
      : allTemplates;

    return json({
      success: true,
      templates,
      meta: {
        total: templates.length,
        totalUsage: templates.reduce((sum, t) => sum + t.usage_count, 0),
        lastUpdated: templates.reduce((latest, t) => 
          new Date(t.lastUpdated) > new Date(latest) ? t.lastUpdated : latest,
          templates[0]?.lastUpdated || new Date().toISOString()
        )
      }
    });

  } catch (error) {
    console.error('Error fetching document templates:', error);
    return json(
      { success: false, message: 'Failed to fetch document templates' },
      { status: 500 }
    );
  }
};