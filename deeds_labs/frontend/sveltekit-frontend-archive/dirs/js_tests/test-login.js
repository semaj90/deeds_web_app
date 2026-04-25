// Test login manually
async function testLogin() {
  try {
    console.log('Testing login API...');

    const response = await fetch('http://localhost:5175/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'admin123',
      }),
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const result = await response.json();
      console.log('Login successful:', result);
    } else {
      const error = await response.text();
      console.error('Login failed:', error);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

testLogin();
