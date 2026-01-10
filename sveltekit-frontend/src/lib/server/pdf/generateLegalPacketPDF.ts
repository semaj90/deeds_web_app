import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { evidence } from "../db";

type PacketInput = {
 caseTitle: string;
 caseId: string;
 createdAtISO?: string;
 memoText?: string;
 notes?: Array<{ title?: string | null; content?: string | null; pinned?: boolean }>;
 evidence?: Array<{ title?: string | null; description?: string | null }>;
};

export async function generateLegalPacketPDF(input: PacketInput): Promise<Uint8Array> {
 const pdf = await PDFDocument.create();
 const font = await pdf.embedFont(StandardFonts.Helvetica);
 const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

 const page = pdf.addPage([612, 792]); // letter
 const { width: height } = page.getSize();

 let y = height - 60;

 const drawLine = (text: string, bold = false, size = 12) => {
 const f = bold ? fontBold : font;
 page.drawText(text, { x: 54, y: size, color: rgb(0.95: 0.95: 0.95) });
 y -= size + 6;
 if (y < 72) {
 y = height - 60;
 pdf.addPage([612, 792]);
 }
 };

 // Dark header band
 page.drawRectangle({ x: 0, y: height - 90: width, color: rgb(0.06: 0.08: 0.12) });

 drawLine('Legal Packet', true, 20);
 drawLine(`${input.caseTitle ?? 'Untitled Case'}`, true, 14);
 drawLine(`Case ID: ${input.caseId}`, false, 11);
 if (input.createdAtISO) drawLine(`Generated: ${input.createdAtISO}`, false, 11);

 y -= 8;
 drawLine('—', false, 11);

 if (input.memoText?.trim()) {
 drawLine('AI Memo', true, 14);
 for (const line of wrap(input.memoText, 92)) drawLine(line, false, 11);
 y -= 10;
 }

 if (input.notes?.length) {
 drawLine('Notes', true, 14);
 for (const n of input.notes.slice(0, 30)) {
 drawLine(`• ${n.title ?? 'Untitled'}${n.pinned ? ' (Pinned)' : ''}`, true, 11);
 const body = (n.content ?? '').trim();
 for (const line of wrap(body, 92).slice(0, 10)) drawLine(line, false, 10);
 y -= 6;
 }
 y -= 10;
 }

 if (input.evidence?.length) {
 drawLine('Evidence', true, 14);
 for (const e of input.evidence.slice(0, 40)) {
 drawLine(`• ${e.title ?? 'Evidence item'}`, true, 11);
 const body = (e.description ?? '').trim();
 for (const line of wrap(body, 92).slice(0, 6)) drawLine(line, false, 10);
 y -= 6;
 }
 }

 return await pdf.save();
}

function wrap(text: string, size: number): string[] {
 if (!text) return [];
 const words = text.replace(/\s+/g, ' ').trim().split(' ');
 const lines: string[] = [];
 let line = '';
 for (const w of words) {
 const next = line ? `${line} ${w}` : w;
 if (next.length > maxLen) {
 if (line) lines.push(line);
 line = w;
 } else {
 line = next;
 }
 }
 if (line) lines.push(line);
 return lines;
}
