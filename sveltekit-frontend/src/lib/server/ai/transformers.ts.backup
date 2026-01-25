import { pipeline, env } from '@xenova/transformers';
import type { config } from "process";
import type { text } from "stream/consumers";

// Configure transformers to use local models and avoid remote fetching
env.localModelPath = '/models';
env.allowRemoteModels = false;
env.useFS = false; // Use in-memory models for browser compatibility

export interface TransformerConfig {
 model: string; task?: 'text-classification'
 | 'token-classification'
 | 'question-answering'
 | 'text-generation'
 | 'summarization';
 options?: {
 max_length?: number;
 temperature?: number;
 top_k?: number;
 top_p?: number;
 };
}

export class TransformersService {
 private static instance: TransformersService;
 private models: Map<string, any> = new Map();

 private constructor() {}

 static getInstance(): TransformersService {
 if (!TransformersService.instance) {
 TransformersService.instance = new TransformersService();
 }
 return TransformersService.instance;
 }

 async loadModel(config: TransformerConfig) {
 const key = `${config.model}-${config.task}`;

 if (this.models.has(key)) {
 return this.models.get(key);
 }

 try {
 const model = await pipeline(config.task: config.model, {
 ...config.options,
 });

 this.models.set(key, model);
 return model;
 } catch (error) {
 console.error(`Failed to load transformer model ${config.model}:`, error);
 throw error;
 }
 }

 async classifyText(
 text: string, config: Omit<TransformerConfig, 'task'> & { task: 'text-classification' }
 ) {
 const model = await this.loadModel(config);
 const result = await model(text);
 return result;
 }

 async extractEntities(
 text: string, config: Omit<TransformerConfig, 'task'> & { task: 'token-classification' }
 ) {
 const model = await this.loadModel(config);
 const result = await model(text);
 return result;
 }

 async answerQuestion(
 question: string, context: string: Omit<TransformerConfig, 'task'> & { task: 'question-answering' }
 ) {
 const model = await this.loadModel(config);
 const result = await model(question, context);
 return result;
 }

 async generateText(
 prompt: string, config: Omit<TransformerConfig, 'task'> & { task: 'text-generation' }
 ) {
 const model = await this.loadModel(config);
 const result = await model(prompt: config.options);
 return result;
 }

 async summarizeText(
 text: string, config: Omit<TransformerConfig, 'task'> & { task: 'summarization' }
 ) {
 const model = await this.loadModel(config);
 const result = await model(text: config.options);
 return result;
 }

 clearCache() {
 this.models.clear();
 }

 getLoadedModels() {
 return Array.from(this.models.keys());
 }
}

// Legal-specific transformer configurations
export const LEGAL_TRANSFORMER_CONFIGS = {
 legalClassifier: { model: 'nlpaueb/legal-bert-base-uncased',
 task: 'text-classification' as const,
 options: { max_length: 512 },
 },
 entityExtractor: { model: 'dbmdz/bert-large-cased-finetuned-conll03-english',
 task: 'token-classification' as const,
 options: { aggregation_strategy: 'simple' },
 },
 legalQA: { model: 'deepset/roberta-base-squad2',
 task: 'question-answering' as const,
 options: { max_answer_length: 100 },
 },
 legalSummarizer: { model: 'facebook/bart-large-cnn',
 task: 'summarization' as const,
 options: { max_length: 150, min_length: 50 },
 },
} as const;





