import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

const testPdfPath = path.join(process.cwd(), '../../lawpdfs', 'California_Penal_Code_1872.pdf');

console.log('Testing PDF parsing...');
console.log('Test file path:', testPdfPath);
console.log('File exists:', fs.existsSync(testPdfPath));

if (fs.existsSync(testPdfPath)) {
  try {
    const dataBuffer = fs.readFileSync(testPdfPath);
    console.log('File size:', dataBuffer.length);

    const data = await pdfParse(dataBuffer);
    console.log('Pages:', data.numpages);
    console.log('Text length:', data.text.length);
    console.log('First 200 chars:', data.text.substring(0, 200));
  } catch (error) {
    console.error('PDF parse error:', error);
  }
} else {
  console.log('Test PDF not found');
}