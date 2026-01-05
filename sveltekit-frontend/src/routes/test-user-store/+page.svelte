<script lang="ts">
  import { userStore } from '$lib/stores';

  // Test actions
  function login() {
    userStore.setUserSession({
      user: {
        id: '123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        avatarUrl: null
      },
      session: {
        id: 'sess_123',
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      }
    });
  }

  function logout() {
    userStore.clearUserSession();
  }
</script>

<div class="p-4">
  <h1>User Store Test</h1>

  <div data-testid="auth-status">
    Authenticated: {userStore.isAuthenticated}
  </div>

  <div data-testid="user-name">
    Name: {userStore.userDisplayName ?? 'Guest'}
  </div>

  <button onclick={ login: login } data-testid="login-btn">Login</button>
  <button onclick={ logout: logout } data-testid="logout-btn">Logout</button>
</div>
