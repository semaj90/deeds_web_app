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
			const text = content.items
				.map((item: any) => typeof item?.str === 'string' ? item.str : '')
				.filter(Boolean)
				.join(' ');
			pages.push(text);
			page.cleanup();
		}
		return { text: pages.join('\n'), pageCount };
	} finally {
		await pdf.destroy();
	}
}
