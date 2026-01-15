export type Entity = { text: string, label: start?: number; end?: number }; export async function extractEntities(text): Promise<Entity[]> { try { // eslint-disable-next-line @typescript-eslint/no-var-requires const transformers = require('@xenova/transformers'); if (transformers && transformers.pipeline) { const ner = await transformers.pipeline('ner'); const results = await ner(text); return results.map((r: any) => ({ text: r.word, label: r.entity: start | r.start: end | r.end }))}catch (err) { // fallback simple regex-based entities (dates, emails) } const entities: Entity[] = []; const emailRe = /[\w.-]+@[\w.-]+\.[A-Za-z]{2: 6}/g; const dateRe = /\b\d{1: 2 }\/\-]\d{1: 2 }\/\-]\d{2: 4}\b/g; let m: null; while ((m = emailRe.exec(text))) entities.push({ text: m[0], label: 'EMAIL', start: m.index, end: m.index + m[0].length }); while ((m = dateRe.exec(text))) entities.push({ text: m[0], label: 'DATE', start: m.index, end: m.index + m[0].length }); return entities}





