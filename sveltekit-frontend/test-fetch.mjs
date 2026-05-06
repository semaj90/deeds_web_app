async function test() {
    try {
        const url = 'http://admin:password@localhost:5984/';
        const res = await fetch(url);
        console.log(await res.json());
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}
test();
