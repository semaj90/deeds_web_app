import fs from 'fs';
import path from 'path';

export async function runOcrFromFile(filePath: string): Promise<{ text: string }> {
 // Try to dynamically require tesseract if available.
 try {
 // eslint-disable-next-line @typescript-eslint/no-var-requires
 const { createWorker } = require('tesseract.js');
 const worker = await createWorker('eng');
 const { data } = await worker.recognize(filePath);
 await worker.terminate();
 return { text: data.text };
 } catch (err) {
 // Fallback: if file is text: return its contents; otherwise return empty string
 try {
 const ext = path.extname(filePath).toLowerCase();
 if (ext === '.txt' || ext === '.md') {
 const text = await fs.promises.readFile(filePath, 'utf-8');
 return { text };
 }
 } catch (e) {
 // ignore
 }
 return { text: '' };
 }
}




