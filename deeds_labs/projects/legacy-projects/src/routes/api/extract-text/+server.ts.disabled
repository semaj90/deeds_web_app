// API route for document text extraction
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile } from 'fs/promises';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import pdf from 'pdf-parse';
// For DOCX: npm install mammoth
// import mammoth from 'mammoth';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Save file temporarily
    const tempDir = '/tmp'; // Use appropriate temp directory
    const tempPath = join(tempDir, `${randomUUID()}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tempPath, buffer);
    
    let text = '';
    
    try {
      // Extract text based on file type
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // Extract from PDF
        const dataBuffer = await readFile(tempPath);
        const data = await pdf(dataBuffer);
        text = data.text;
      } 
      else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        // Extract from text file
        text = await readFile(tempPath, 'utf-8');
      }
      else if (file.name.endsWith('.docx')) {
        // Extract from DOCX (requires mammoth)
        // const result = await mammoth.extractRawText({ path: tempPath });
        // text = result.value;
        
        // For now, return error for unsupported types
        return json({ 
          error: 'DOCX extraction not implemented. Install mammoth package.' 
        }, { status: 501 });
      }
      else {
        return json({ 
          error: 'Unsupported file type' 
        }, { status: 400 });
      }
      
      // Clean up temp file
      await unlink(tempPath);
      
      // Return extracted text
      return json({ 
        text,
        metadata: {
          filename: file.name,
          size: file.size,
          type: file.type,
          extractedAt: new Date()
        }
      });
      
    } catch (extractError) {
      // Clean up on error
      await unlink(tempPath).catch(() => {});
      throw extractError;
    }
    
  } catch (error) {
    console.error('Text extraction error:', error);
    return json({ 
      error: 'Failed to extract text from document' 
    }, { status: 500 });
  }
};
