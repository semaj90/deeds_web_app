
import fetch from 'node-fetch';

const baseUrl = 'http://localhost:5173';

const routes = [
    { path: '/', method: 'GET', expected: 200 },
    { path: '/cases/new', method: 'GET', expected: 200 },
    { path: '/api/cases', method: 'POST', body: {title: 'Test', description: 'Test'}, expected: 201 },
    { path: '/api/cases', method: 'GET', expected: 200 }
];

async function verify() {
    console.log(`Verifying routes on ${baseUrl}...`);
    let success = true;

    for (const route of routes) {
        try {
            const options = {
                method: route.method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (route.body) options.body = JSON.stringify(route.body);

            const res = await fetch(`${baseUrl}${route.path}`, options);

            if (res.status === route.expected || (route.method === 'POST' && res.status === 200)) { // 200 or 201 acceptable for POST sometimes
                console.log(`✅ ${route.method} ${route.path} - OK (${res.status})`);
            } else {
                console.log(`❌ ${route.method} ${route.path} - FAILED (Expected ${route.expected}, got ${res.status})`);
                success = false;
            }
        } catch (e) {
            console.log(`❌ ${route.method} ${route.path} - ERROR: ${e.message}`);
            success = false;
        }
    }

    if (success) {
        console.log('ALL ROUTES PASSED');
        process.exit(0);
    } else {
        console.log('SOME ROUTES FAILED');
        process.exit(1);
    }
}

verify();
