import fetch from 'node-fetch';

async function testCouchDB() {
    try {
        const url = 'http://admin:password@localhost:5984/';
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log('CouchDB Auth Success:', data);
        } else {
            console.log('CouchDB Auth Failed:', res.status, res.statusText);
        }
    } catch (err) {
        console.error('Connection error:', err);
    }
}

testCouchDB();
