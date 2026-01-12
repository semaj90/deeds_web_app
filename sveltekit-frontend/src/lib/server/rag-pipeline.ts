import { enqueueJob } from '$lib/server/queue'; // your RabbitMQ / worker abstraction

export async function enqueueRagIndexingJob(payload: {
 caseId?: string; chatTurnId: string;
 message: string; objects: { bucket: string; objectName: string }[];
 processedFiles?: Array<{ filename: string;
 text: string; method: string;
 engines: string[];
 metadata?, any;
 }>;
}) {
 await enqueueJob('rag-indexing', payload);
}




