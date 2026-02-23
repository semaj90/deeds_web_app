import { pipeline } from '@xenova/transformers';
import { logger } from '../utils/logger.js';

let nerPipeline: any = null;

async function getNERPipeline() {
  if (!nerPipeline) {
    logger.info('Loading NER pipeline...');
    nerPipeline = await pipeline('token-classification', 'Xenova/bert-base-NER');
    logger.info('NER pipeline loaded');
  }
  return nerPipeline;
}

export interface Entity {
  text: string;
  label: string;
  score: number;
  start: number;
  end: number;
}

export async function extractEntities(text: string): Promise<Entity[]> {
  try {
    logger.info('Extracting entities', { textLength: text.length });

    const ner = await getNERPipeline();
    const results = await ner(text);

    const entities: Entity[] = results
      .filter((r: any) => r.score > 0.5)
      .map((r: any) => ({
        text: r.word,
        label: r.entity,
        score: r.score,
        start: r.start,
        end: r.end,
      }));

    logger.info('Entity extraction completed', { entityCount: entities.length });
    return entities;
  } catch (error) {
    logger.error('Entity extraction failed', { error });
    // Fallback to simple regex-based extraction
    return extractEntitiesRegex(text);
  }
}

function extractEntitiesRegex(text: string): Entity[] {
  const entities: Entity[] = [];

  // Email addresses
  const emailRegex = /[\w.-]+@[\w.-]+\.[A-Za-z]{2,6}/g;
  let match;
  while ((match = emailRegex.exec(text))) {
    entities.push({
      text: match[0],
      label: 'EMAIL',
      score: 1.0,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Phone numbers
  const phoneRegex = /\+?\d[\d \-()]{6,}\d/g;
  while ((match = phoneRegex.exec(text))) {
    entities.push({
      text: match[0],
      label: 'PHONE',
      score: 1.0,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // Dates
  const dateRegex = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
  while ((match = dateRegex.exec(text))) {
    entities.push({
      text: match[0],
      label: 'DATE',
      score: 1.0,
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return entities;
}
