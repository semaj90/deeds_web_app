import type { CaseSynthesis } from '$lib/server/cases/caseSynthesis';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface CaseData {
    id: string;
    title: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}

interface PacketData {
    caseData: CaseData;
    synthesis: CaseSynthesis;
}

/**
 * Generate a comprehensive legal case packet PDF
 * Includes case details, notes, evidence summary, and AI analysis
 */
export async function generateLegalPacketPDF(data: PacketData): Promise<Uint8Array> {
    const { caseData, synthesis } = data;

    // Create new PDF document
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const boldFont = await pdfDoc.embedFont(StandardFonts.TimesBold);

    // Add title page
    const titlePage = pdfDoc.addPage();
    const { width, height } = titlePage.getSize();

    titlePage.drawText('LEGAL CASE PACKET', {
        x: 50,
        y: height - 100,
        size: 24,
        font: boldFont,
        color: rgb(0, 0, 0),
    });

    titlePage.drawText(`Case ID: ${caseData.id}`, {
        x: 50,
        y: height - 150,
        size: 12,
        font
    });

    titlePage.drawText(`Title: ${caseData.title}`, {
        x: 50,
        y: height - 180,
        size: 14,
        font: boldFont
    });

    titlePage.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
        x: 50,
        y: height - 210,
        size: 10,
        font,
        color: rgb(0.5, 0.5, 0.5),
    });

    const summaryPage = pdfDoc.addPage();

    summaryPage.drawText('CASE SUMMARY', {
        x: 50,
        y: height - 100,
        size: 18,
        font: boldFont,
    });

    let yPos = height - 140;
    if (caseData.description) {
        summaryPage.drawText(`Description: ${caseData.description}`, {
            x: 50,
            y: yPos,
            size: 12,
            font,
            maxWidth: width - 100,
        });
        yPos -= 40;
    }

    summaryPage.drawText(`Total Notes: ${synthesis.notes.length}`, {
        x: 50,
        y: yPos,
        size: 12,
        font,
    });
    yPos -= 20;

    summaryPage.drawText(`Total Evidence: ${synthesis.evidence.length}`, {
        x: 50,
        y: yPos,
        size: 12,
        font,
    });
    yPos -= 20;

    summaryPage.drawText(`AI Analysis Available: ${synthesis.analysis ? 'Yes' : 'No'}`, {
        x: 50,
        y: yPos,
        size: 12,
        font,
    });

    if (synthesis.notes.length > 0) {
        let notesPage = pdfDoc.addPage();

        notesPage.drawText('CASE NOTES', {
            x: 50,
            y: height - 100,
            size: 18,
            font: boldFont,
        });

        let notesYPos = height - 140;
        synthesis.notes.forEach((note, index) => {
            if (notesYPos < 100) {
                // Add new page if needed
                notesPage = pdfDoc.addPage();
                notesYPos = height - 100;
            }

            notesPage.drawText(`${index + 1}. ${note.title}`, {
                x: 50,
                y: notesYPos,
                size: 14,
                font: boldFont,
                maxWidth: width - 100,
            });
            notesYPos -= 25;

            if (note.content) {
                notesPage.drawText(
                    note.content.substring(0, 500) + (note.content.length > 500 ? '...' : ''),
                    {
                        x: 70,
                        y: notesYPos,
                        size: 10,
                        font,
                        maxWidth: width - 140,
                    }
                );
                notesYPos -= 60;
            }
        });
    }

    // Add evidence summary
    if (synthesis.evidence.length > 0) {
        let evidencePage = pdfDoc.addPage();

        evidencePage.drawText('EVIDENCE SUMMARY', {
            x: 50,
            y: height - 100,
            size: 18,
            font: boldFont,
        });

        let evidenceYPos = height - 140;
        synthesis.evidence.forEach((evidence, index) => {
            if (evidenceYPos < 100) {
                evidencePage = pdfDoc.addPage();
                evidenceYPos = height - 100;
            }

            // @ts-ignore
            evidencePage.drawText(`${index + 1}. ${evidence.file_name}`, {
                x: 50,
                y: evidenceYPos,
                size: 12,
                font,
                maxWidth: width - 100,
            });
            evidenceYPos -= 20;

            // @ts-ignore
            evidencePage.drawText(`Type: ${evidence.file_type} | Status: ${evidence.status}`, {
                x: 70,
                y: evidenceYPos,
                size: 10,
                font,
                color: rgb(0.5, 0.5, 0.5),
            });
            evidenceYPos -= 25;
        });
    }

    // Add AI analysis if available
    if (synthesis.analysis) {
        const analysisPage = pdfDoc.addPage();

        analysisPage.drawText('AI ANALYSIS', {
            x: 50,
            y: height - 100,
            size: 18,
            font: boldFont,
        });

        const analysisYPos = height - 140;
        const analysisText = synthesis.analysis.substring(0, 2000);
        analysisPage.drawText(analysisText, {
            x: 50,
            y: analysisYPos,
            size: 10,
            font,
            maxWidth: width - 100,
        });
    }

    // Serialize the PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}
