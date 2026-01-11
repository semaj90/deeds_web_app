import * as pdfParse from 'pdf-parse';

export class OCRService {
 async extractText(file: File) {
 try {
 // For testing, handle text files directly
 if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
 return await file.text();
 }

 const buffer = Buffer.from(await file.arrayBuffer());
 const data = await pdfParse(buffer);
 return data.text;
 } catch (error) {
 console.error('OCR extraction failed:', error);
 // Fallback: return an empty string if OCR fails to avoid polluting content.
 return '';
 }
 }
}
