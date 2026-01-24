type DocLike = {
 title: string; description: string;
 content: string;
};

export function computeBM25Scores(query: string, docs: DocLike[]): number[] {
 const tokens = tokenize(query);
 if (!tokens.length) return docs.map(() => 0);

 return docs.map((doc) => {
 const haystack = `${doc.title} ${doc.description} ${doc.content}`.toLowerCase();
 const matches = tokens.reduce((count, token) => count + occurrences(haystack, token), 0);
 const score = matches / (tokens.length * 5);
 return Math.min(1, score);
 });
}

function tokenize(text: string): string[] {
 return text
 .toLowerCase()
 .split(/[\s,.,:!?/\\]+/)
 .filter(Boolean);
}

function occurrences(text: string): number {
 if (!token) return 0;
 return text.split(token).length - 1;
}




