import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    try {
        // Fetch clusters summary from Postgres
        const clustersResult = await db.execute(sql`
            SELECT
                c.cluster_id,
                COUNT(*) as error_count,
                MIN(e.timestamp) as first_seen,
                MAX(e.timestamp) as last_seen,
                (ARRAY_AGG(e.message))[1] as sample_message,
                (ARRAY_AGG(e.source))[1] as sample_source
            FROM phase89_error_clusters c
            JOIN phase89_error_instances e ON c.error_id = e.id
            GROUP BY c.cluster_id
            ORDER BY error_count DESC
        `);

        // Fetch existing KB cards (summaries)
        const summariesResult = await db.execute(sql`
            SELECT * FROM phase89_kb_cards
            WHERE card_type = 'cluster_summary' OR card_type = 'cluster_analysis'
            ORDER BY created_at DESC
        `);

        return {
            clusters: clustersResult.rows,
            summaries: summariesResult.rows
        };
    } catch (error) {
        console.error('Failed to load Phase 89 data:', error);
        return {
            clusters: [],
            summaries: [],
            error: 'Failed to load data'
        };
    }
};

export const actions: Actions = {
    analyze: async ({ request }) => {
        const data = await request.formData();
        const clusterId = data.get('clusterId');

        if (!clusterId) return { success: false, error: 'Missing clusterId' };

        try {
            // Fetch cluster details
            const clusterResult = await db.execute(sql`
                SELECT
                    c.cluster_id,
                    (ARRAY_AGG(e.message))[1:5] as sample_messages,
                    (ARRAY_AGG(e.source))[1:5] as sample_sources
                FROM phase89_error_clusters c
                JOIN phase89_error_instances e ON c.error_id = e.id
                WHERE c.cluster_id = ${clusterId}
                GROUP BY c.cluster_id
            `);

            if (clusterResult.rows.length === 0) return { success: false, error: 'Cluster not found' };
            const cluster = clusterResult.rows[0] as any;

            // Call Gemini
            const apiKey = env.GEMINI_API_KEY;
            if (!apiKey) return { success: false, error: 'Missing GEMINI_API_KEY' };

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: env?.GEMINI_MODEL ?? 'gemini-2.0-flash-exp' });

            const prompt = [
                'Analyze this error cluster (ID: ' + clusterId + '):',
                'Sample Messages:',
                (cluster.sample_messages || []).join('\n'),
                '',
                'Sample Sources:',
                (cluster.sample_sources || []).join('\n'),
                '',
                'Provide:',
                '1. A concise title.',
                '2. A detailed description of the root cause.',
                '3. A suggested fix strategy.',
                '4. Relevant tags (comma separated).',
                '',
                'Format as JSON: { "title": "...", "description": "...", "fix_strategy": "...", "tags": ["..."] }'
            ].join('\n');

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Parse JSON (handle markdown code blocks)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('Invalid JSON response from Gemini');
            const analysis = JSON.parse(jsonMatch[0]);

            // Save to KB cards
            await db.execute(sql`
                INSERT INTO phase89_kb_cards (
                    card_type, title, description, tags, metadata, created_at
                ) VALUES (
                    'cluster_analysis',
                    ${analysis.title},
                    ${analysis.description},
                    ${analysis.tags},
                    ${JSON.stringify({ fix_strategy: analysis.fix_strategy, cluster_id: clusterId, provider: 'gemini' })},
                    NOW()
                )
            `);

            return { success: true, analysis };

        } catch (error) {
            console.error('Gemini analysis failed:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
};