#!/usr/bin/env node

console.log('Testing avatar system...');

async function testRegistration() {
  try {
    console.log('Testing user registration...');

    const response = await fetch('http://localhost:5173/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Avatar Test User',
        email: 'avatar.test@example.com',
        password: 'testpassword123',
      }),
    });

    const data = await response.json();
    console.log('Registration response:', data);

    if (response.ok) {
      console.log('✅ Registration successful!');
      return data.user;
    } else {
      console.log('❌ Registration failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    return null;
  }
}

async function testLogin() {
  try {
    console.log('Testing user login...');

    const response = await fetch('http://localhost:5173/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'avatar.test@example.com',
        password: 'testpassword123',
      }),
    });

    const data = await response.json();
    console.log('Login response:', data);

    if (response.ok) {
      console.log('✅ Login successful!');
      return data.user;
    } else {
      console.log('❌ Login failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return null;
  }
}

async function testProfileAPI() {
  try {
    console.log('Testing profile API...');

    const response = await fetch('http://localhost:5173/api/user/profile', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('Profile response:', data);

    if (response.ok) {
      console.log('✅ Profile fetch successful!');
      return data.user;
    } else {
      console.log('❌ Profile fetch failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Profile fetch error:', error.message);
    return null;
  }
}

async function main() {
  console.log('🚀 Starting Avatar System Test\n');

  // Test registration
  const registeredUser = await testRegistration();
  console.log('');

  // Test login (mock login since the login API uses mock auth)
  const loggedInUser = await testLogin();
  console.log('');

  // Test profile API
  const profileUser = await testProfileAPI();
  console.log('');

  console.log('🎉 Avatar system test complete!');
  console.log('');
  console.log('🔗 Visit http://localhost:5173/profile to test the avatar UI');
  console.log('🔗 Visit http://localhost:5173/register to register a new user');
  console.log('🔗 Visit http://localhost:5173/login to login');
}

main();
