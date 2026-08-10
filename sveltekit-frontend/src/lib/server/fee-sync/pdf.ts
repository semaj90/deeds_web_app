export async function extractPdfText(pdfBuffer: Buffer, maxPages = 80): Promise<{ text: string; pageCount: number }> {
	const pdfjsPath = ['pdfjs-dist', 'legacy', 'build', 'pdf.mjs'].join('/');
	const { getDocument } = await import(/* @vite-ignore */ pdfjsPath);
	const pdf = await getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
	try {
		const pageCount = pdf.numPages;
		const limit = Math.min(pageCount, maxPages);
		const pages: string[] = [];
		for (let pageNo = 1; pageNo <= limit; pageNo++) {
			const page = await pdf.getPage(pageNo);
			const content = await page.getTextContent();
			const lines: string[] = [];
			let current = '';
			for (const item of content.items as any[]) {
				if (typeof item?.str !== 'string' || !item.str) continue;
				current += `${current ? ' ' : ''}${item.str}`;
				if (item.hasEOL) {
					lines.push(current.trim());
					current = '';
				}
			}
			if (current.trim()) lines.push(current.trim());
			pages.push(lines.join('\n'));
			page.cleanup();
		}
		return { text: pages.join('\n'), pageCount };
	} finally {
		await pdf.destroy();
	}
}
