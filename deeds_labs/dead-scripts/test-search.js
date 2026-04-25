async function test() {
	try {
		// 1. Test Search
		const searchRes = await fetch('http://localhost:5173/api/statutes/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query: 'eminent domain', limit: 3 })
		});
		const searchData = await searchRes.json();
		console.log('--- Search Results ---');
		console.log(JSON.stringify(searchData, null, 2));

		if (searchData.results && searchData.results.length > 0) {
			const first = searchData.results[0];
			const citation = first.section;
			console.log(`\n--- Testing Resolution for: ${citation} ---`);
			const resolveRes = await fetch(`http://localhost:5173/api/library/resolve-citation?q=${encodeURIComponent(citation)}`);
			const resolveData = await resolveRes.json();
			console.log(JSON.stringify(resolveData, null, 2));
		}
	} catch (err) {
		console.error('Test failed:', err);
	}
}

test();
