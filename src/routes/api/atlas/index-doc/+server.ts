// src/routes/api/atlas/index-doc/+server.ts
import { z } from "zod";
import { getSession, type Session } from "@auth/sveltekit";
import { embedQuery, upsertQdrant, writeAtlasPacket, generateSourceRef } from "$lib/utils/atlas_service";

export async function POST({ request }: { request: Request }) {
    // 1. Validate incoming payload
    const schema = z.object({
        summaryText: z.string().describe("The synthesized summary text for the new packet."),
        featureId: z.string().optional(),
        domainClass: z.string().optional(),
        conceptIds: z.array(z.string()).optional(),
        sourceRef: z.string().optional(),
    });

    const { success, data } = await schema.safeParse(await JSON.parse(await request.text()));

    if (!success) {
        return { success: false, error: "Invalid payload structure", details: data.error };
    }

    // 2. Process and index the document
    try {
        const runId = `manual_ingest_${Date.now()}`;
        await upsertQdrant(data.summaryText, data.sourceRef || "unknown");
        await writeAtlasPacket({
            runId: runId,
            summary: data.summaryText,
            featureId: data.featureId,
            domainClass: data.domainClass,
            conceptIds: data.conceptIds,
            sourceRef: data.sourceRef,
        });

        return { success: true, message: `Atlas packet ${runId} successfully indexed.` };
    } catch (e) {
        console.error("Error during atlas indexing:", e);
        return { success: false, error: "Failed to index document." };
    }
}