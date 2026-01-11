/**
 * Document Types API
 * GET /api/ai/document-drafting/types - Get available document types
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const documentTypes = [
      {
        id: 'motion_to_suppress',
        name: 'Motion to Suppress Evidence',
        category: 'litigation',
        description: 'Legal motion challenging the admissibility of evidence based on constitutional violations',
        complexity: 'intermediate',
        estimatedTime: '15-20 minutes',
        icon: '⚖️',
        requiredFields: [
          { name: 'caseTitle', type: 'text', required: true, label: 'Case Title' },
          { name: 'jurisdiction', type: 'select', required: true, label: 'Jurisdiction', options: ['Federal', 'State'] },
          { name: 'evidenceDescription', type: 'textarea', required: true, label: 'Evidence Description' },
          { name: 'constitutionalBasis', type: 'select', required: true, label: 'Constitutional Basis', options: ['Fourth Amendment', 'Fifth Amendment', 'Sixth Amendment'] }
        ]
      },
      {
        id: 'plea_agreement',
        name: 'Plea Agreement',
        category: 'contract',
        description: 'Structured plea negotiation document with mitigation factors',
        complexity: 'intermediate',
        estimatedTime: '20-25 minutes',
        icon: '🤝',
        requiredFields: [
          { name: 'defendantName', type: 'text', required: true, label: 'Defendant Name' },
          { name: 'charges', type: 'textarea', required: true, label: 'Original Charges' },
          { name: 'pleaTerms', type: 'textarea', required: true, label: 'Plea Terms' },
          { name: 'mitigationFactors', type: 'textarea', required: false, label: 'Mitigation Factors' }
        ]
      },
      {
        id: 'discovery_request',
        name: 'Discovery Request',
        category: 'discovery',
        description: 'Formal request for evidence and information discovery',
        complexity: 'basic',
        estimatedTime: '10-15 minutes',
        icon: '🔍',
        requiredFields: [
          { name: 'requestType', type: 'select', required: true, label: 'Request Type', options: ['Documents', 'Depositions', 'Expert Reports', 'Electronic Evidence'] },
          { name: 'relevanceStatement', type: 'textarea', required: true, label: 'Relevance Statement' },
          { name: 'timeframe', type: 'text', required: false, label: 'Time Frame' }
        ]
      },
      {
        id: 'opening_statement',
        name: 'Opening Statement',
        category: 'pleading',
        description: 'Trial opening statement framework',
        complexity: 'advanced',
        estimatedTime: '30-40 minutes',
        icon: '🎯',
        requiredFields: [
          { name: 'caseTheme', type: 'text', required: true, label: 'Case Theme' },
          { name: 'keyFacts', type: 'textarea', required: true, label: 'Key Facts' },
          { name: 'legalTheory', type: 'textarea', required: true, label: 'Legal Theory' },
          { name: 'anticipatedDefense', type: 'textarea', required: false, label: 'Anticipated Defense Arguments' }
        ]
      },
      {
        id: 'sentencing_memo',
        name: 'Sentencing Memorandum',
        category: 'pleading',
        description: 'Comprehensive sentencing argument with mitigation',
        complexity: 'advanced',
        estimatedTime: '25-35 minutes',
        icon: '📝',
        requiredFields: [
          { name: 'convictionDetails', type: 'textarea', required: true, label: 'Conviction Details' },
          { name: 'mitigationArguments', type: 'textarea', required: true, label: 'Mitigation Arguments' },
          { name: 'characterReferences', type: 'textarea', required: false, label: 'Character References' },
          { name: 'recommendedSentence', type: 'text', required: true, label: 'Recommended Sentence' }
        ]
      },
      {
        id: 'brief_outline',
        name: 'Legal Brief Outline',
        category: 'litigation',
        description: 'Structured outline for legal briefs and memoranda',
        complexity: 'intermediate',
        estimatedTime: '20-30 minutes',
        icon: '📋',
        requiredFields: [
          { name: 'briefType', type: 'select', required: true, label: 'Brief Type', options: ['Motion Brief', 'Appellate Brief', 'Summary Judgment Brief', 'Response Brief'] },
          { name: 'legalIssues', type: 'textarea', required: true, label: 'Legal Issues' },
          { name: 'precedents', type: 'textarea', required: false, label: 'Key Precedents' },
          { name: 'arguments', type: 'textarea', required: true, label: 'Main Arguments' }
        ]
      }
    ];

    return json({
      success: true,
      documentTypes,
      meta: {
        total: documentTypes.length,
        categories: Array.from(new Set(documentTypes.map(dt => dt.category))),
        complexityLevels: Array.from(new Set(documentTypes.map(dt => dt.complexity)))
      }
    });

  } catch (error) {
    console.error('Error fetching document types:', error);
    return json(
      { success: false, message: 'Failed to fetch document types' },
      { status: 500 }
    );
  }
};