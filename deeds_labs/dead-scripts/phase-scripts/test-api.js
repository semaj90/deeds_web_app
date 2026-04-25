
async function test() {
    try {
        console.log('Fetching /test ...');
        const resTest = await fetch('http://127.0.0.1:5175/test');
        console.log('Test status:', resTest.status);
        console.log('Test text:', await resTest.text());

        console.log('Fetching /api/auth/register...');
        const uniqueEmail = `test${Date.now()}@example.com`;
        const resReg = await fetch('http://127.0.0.1:5175/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: uniqueEmail,
                password: 'password123',
                firstName: 'Test',
                lastName: 'User'
            })
        });
        console.log('Register status:', resReg.status);
        console.log('Register text:', await resReg.text());

    } catch (e) {
        console.error('Fetch failed:', e);
    }
}
test();
