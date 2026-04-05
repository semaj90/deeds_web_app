import path from 'node:path';
import fs from 'node:fs';

let ASTVectorizerCtor: any = null;

function loadAddon() {
 if (ASTVectorizerCtor) return ASTVectorizerCtor;

 const candidate = path.resolve('build', 'Release', 'ast_error_vectorizer.node');

 if (!fs.existsSync(candidate)) {
 throw new Error(`ast_error_vectorizer.node not found at ${candidate}. Run CMake build first.`);
 }

 // eslint-disable-next-line @typescript-eslint/no-var-requires
 const addon = require(candidate);
 if (!addon.ASTVectorizer) {
 throw new Error('ASTVectorizer export missing from ast_error_vectorizer.node');
 }

 ASTVectorizerCtor = addon.ASTVectorizer;
 return ASTVectorizerCtor;
}

export function createAstVectorizer(modelPath: string) {
 const Ctor = loadAddon();
 const instance = new Ctor();

 const ok = instance.loadModel(modelPath);
 if (!ok) {
 throw new Error(`Failed to load BERT model at: ${ modelPath }`);
 }

 return instance as {
 generateEmbedding(msg: string): number[];
 generateBatch(errs: string[]): number[][];
 getErrorCount(): number;
 exportErrors(): string;
 };
}



