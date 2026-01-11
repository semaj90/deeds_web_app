/**
 * Recent Documents API
 * GET /api/ai/document-drafting/recent - Get recently created/modified documents
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    // Mock recent documents data - in production this would query the database
    const recentDocuments = [
      {
        id: 'doc_recent_001',
        template: 'Motion to Suppress Evidence',
        category: 'litigation',
        generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        qualityScore: 94,
        wordCount: 1247,
        status: 'draft',
        caseId: 'case_12345',
        lastModified: new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 minutes ago
      },
      {
        id: 'doc_recent_002',
        template: 'Discovery Request',
        category: 'discovery',
        generatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        qualityScore: 89,
        wordCount: 892,
        status: 'review',
        caseId: 'case_54321',
        lastModified: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
      },
      {
        id: 'doc_recent_003',
        template: 'Plea Agreement',
        category: 'contract',
        generatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        qualityScore: 97,
        wordCount: 2156,
        status: 'finalized',
        caseId: 'case_67890',
        lastModified: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString() // 20 hours ago
      },
      {
        id: 'doc_recent_004',
        template: 'Opening Statement',
        category: 'pleading',
        generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        qualityScore: 91,
        wordCount: 1789,
        status: 'review',
        caseId: 'case_98765',
        lastModified: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString() // 18 hours ago
      },
      {
        id: 'doc_recent_005',
        template: 'Sentencing Memorandum',
        category: 'pleading',
        generatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        qualityScore: 93,
        wordCount: 3421,
        status: 'finalized',
        caseId: 'case_11111',
        lastModified: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
      },
      {
        id: 'doc_recent_006',
        template: 'Legal Brief Outline',
        category: 'litigation',
        generatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
        qualityScore: 87,
        wordCount: 1523,
        status: 'draft',
        caseId: 'case_22222',
        lastModified: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      },
      {
        id: 'doc_recent_007',
        template: 'Motion to Suppress Evidence',
        category: 'litigation',
        generatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        qualityScore: 88,
        wordCount: 1134,
        status: 'review',
        caseId: 'case_33333',
        lastModified: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() // 4 days ago
      },
      {
        id: 'doc_recent_008',
        template: 'Discovery Request',
        category: 'discovery',
        generatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
        qualityScore: 92,
        wordCount: 967,
        status: 'finalized',
        caseId: 'case_44444',
        lastModified: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
      },
      {
        id: 'doc_recent_009',
        template: 'Plea Agreement',
        category: 'contract',
        generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        qualityScore: 95,
        wordCount: 2234,
        status: 'finalized',
        caseId: 'case_55555',
        lastModified: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() // 6 days ago
      },
      {
        id: 'doc_recent_010',
        template: 'Opening Statement',
        category: 'pleading',
        generatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
        qualityScore: 90,
        wordCount: 1645,
        status: 'review',
        caseId: 'case_66666',
        lastModified: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days ago
      }
    ];

    // Sort by lastModified (most recent first) and apply limit
    const sortedDocuments = recentDocuments
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, limit);

    // Calculate summary statistics
    const stats = {
      totalDocuments: recentDocuments.length,
      avgQualityScore: Math.round(
        recentDocuments.reduce((sum, doc) => sum + doc.qualityScore, 0) / recentDocuments.length
      ),
      totalWordCount: recentDocuments.reduce((sum, doc) => sum + doc.wordCount, 0),
      documentsByStatus: {
        draft: recentDocuments.filter(d => d.status === 'draft').length,
        review: recentDocuments.filter(d => d.status === 'review').length,
        finalized: recentDocuments.filter(d => d.status === 'finalized').length
      },
      documentsByCategory: recentDocuments.reduce((acc, doc) => {
        acc[doc.category] = (acc[doc.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentActivity: {
        last24Hours: recentDocuments.filter(d => 
          new Date(d.lastModified).getTime() > Date.now() - 24 * 60 * 60 * 1000
        ).length,
        lastWeek: recentDocuments.filter(d => 
          new Date(d.lastModified).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
        ).length
      }
    };

    return json({
      success: true,
      data: sortedDocuments,
      stats,
      meta: {
        limit,
        total: recentDocuments.length,
        userId: locals?.user?.id || 'anonymous',
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    });

  } catch (error) {
    console.error('Error fetching recent documents:', error);
    return json(
      { success: false, message: 'Failed to fetch recent documents' },
      { status: 500 }
    );
  }
};