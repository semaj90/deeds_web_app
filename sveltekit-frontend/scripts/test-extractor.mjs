import http from 'http';

http.get('http://localhost:5173/api/routes/metadata', (r) => {
  let d = '';
  r.on('data', (c) => d += c);
  r.on('end', () => {
    const j = JSON.parse(d);
    const s = j.data.stats;
    console.log('=== STATS ===');
    console.log(JSON.stringify(s, null, 2));
    console.log('');
    console.log('=== TOP 30 CATEGORIES ===');
    for (const c of j.data.categories.slice(0, 30)) {
      console.log('  ' + String(c.count).padStart(4) + '  ' + c.name);
    }
    console.log('');

    // Check for the old 'Api' super-category bug
    const apiCat = j.data.categories.find(c => c.name === 'Api');
    if (apiCat) {
      console.log('BUG: "Api" super-category still exists with ' + apiCat.count + ' endpoints');
    } else {
      console.log('GOOD: No "Api" super-category — routes properly sub-categorized');
    }
  });
});
