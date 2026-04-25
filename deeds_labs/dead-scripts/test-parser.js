const fs = require('fs');

const data = fs.readFileSync('reports/svelte-check-phase103.txt', 'utf8');
const lines = data.split('\n');

console.log('Total lines:', lines.length);

const errorLines = lines.filter(l => l.includes('ERROR'));
console.log('ERROR lines:', errorLines.length);

if (errorLines.length > 0) {
	const testLine = errorLines[0];
	console.log('\nFirst ERROR line:');
	console.log(testLine);
	console.log('\nTrying to match...');

	const match = testLine.match(/^\d+\s+ERROR\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"$/);

	if (match) {
		console.log('✅ MATCHED!');
		console.log('File:', match[1]);
		console.log('Line:', match[2]);
		console.log('Col:', match[3]);
		console.log('Message:', match[4]);
	} else {
		console.log('❌ NO MATCH');
		console.log('Line length:', testLine.length);
		console.log('Line ends with:', testLine.slice(-10).split('').map(c => c.charCodeAt(0)));
	}
}
