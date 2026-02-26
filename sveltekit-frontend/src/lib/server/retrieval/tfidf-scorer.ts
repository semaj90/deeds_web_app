/** TF-IDF scorer for legal document search. */
export interface ScoredDocument {
	id: string;
	text: string;
	tfidfScore: number;
}

function tokenize(text: string): string[] {
	const n = text.toLowerCase();
	const r = /\u00a7+|[\w]+(?:\.[\w]+)*(?:-[\w]+)*|u\.s\.c\./g;
	const t: string[] = [];
	let m: RegExpExecArray | null;
	while ((m = r.exec(n)) !== null) { if (m[0].length > 0) t.push(m[0]); }
	return t;
}

const STOP_WORDS = new Set([
	"the","a","an","is","are","was","were","be","been","being",
	"have","has","had","do","does","did","will","would","could",
	"should","may","might","shall","can","to","of","in","for",
	"on","with","at","by","from","as","into","about","between",
	"through","after","before","above","below","and","or","not",
	"but","if","then","than","so","no","nor","too","very",
	"what","which","who","whom","this","that","these","those",
	"how","when","where","why","all","each","every","both",
	"few","more","most","other","some","such","only","own",
	"same","just","also","any","it","its"
]);

function removeStopWords(tokens: string[]): string[] {
	return tokens.filter(t => {
		if (t.startsWith("§")) return true;
		if (t.includes(".")) return true;
		return !STOP_WORDS.has(t);
	});
}

export function computeTFIDF(
	query: string,
	documents: Array<{ id: string; text: string }>
): ScoredDocument[] {
	if (documents.length === 0) return [];
	const queryTokens = removeStopWords(tokenize(query));
	if (queryTokens.length === 0) {
		return documents.map(d => ({ id: d.id, text: d.text, tfidfScore: 0 }));
	}
	const docTokenLists = documents.map(d => removeStopWords(tokenize(d.text)));
	const N = documents.length;
	const idf = new Map();
	for (const term of queryTokens) {
		if (idf.has(term)) continue;
		let df = 0;
		for (const dT of docTokenLists) { if (dT.includes(term)) df++; }
		idf.set(term, Math.log((N + 1) / (1 + df)));
	}
	const scores = [];
	for (let i = 0; i < documents.length; i++) {
		const dT = docTokenLists[i];
		const tot = dT.length || 1;
		let s = 0;
		for (const term of queryTokens) {
			let c = 0;
			for (const d of dT) { if (d === term) c++; }
			s += (c / tot) * (idf.get(term) ?? 0);
		}
		scores.push({ id: documents[i].id, text: documents[i].text, tfidfScore: s });
	}
	const mx = Math.max(...scores.map(s => s.tfidfScore), 0.0001);
	for (const s of scores) { s.tfidfScore = s.tfidfScore / mx; }
	scores.sort((a, b) => b.tfidfScore - a.tfidfScore);
	return scores;
}
