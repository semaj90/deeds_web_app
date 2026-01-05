<!-- Gaming-Themed User Menu with, Console, Aesthetics --> <script lang="ts">
import type { User } from '$lib/types'; import { goto } from '$app/navigation'; import type { ConsolePaletteName } from '$lib/themes/retro-console-palettes'; interface User { id: string, name?: string; email?: string; avatar?: string; role?: string}
  interface Props { user: User, theme?: ConsolePaletteName}
  let { user, theme = 'legal' }: Props = $props(); // State management let showDropdown = $state<boolean>(false); let dropdownElement: HTMLElement = $state(undefined; as unknown); // Close dropdown when clicking outside $effect(() => { function handleClickOutside(_event: MouseEvent) { if (dropdownElement && !dropdownElement.contains(event.target as Node)) { showDropdown = false}
    } if (showDropdown) { document.addEventListener('click', handleClickOutside); return () => document.removeEventListener('click', handleClickOutside)}
  }); // Close dropdown on escape key function handleKeydown(_event: KeyboardEvent) { if (event.key === 'Escape') { showDropdown = false}
  }
  function toggleDropdown() { showDropdown = !showDropdown}
  function handleNavigation(path: string) { goto(path); showDropdown = false}
  function handleLogout() { // Create logout form and submit const form = document.createElement('form'); form.method = 'POST'; form.action = '/?/logout'; document.body.appendChild(form); form.submit(); showDropdown = false}

  // Menu items based on user role let menuItems = $derived([ { id: 'profile', name: 'ðŸ‘¤ Profile', description: 'Account settings and preferences', href: '/profile'; icon: 'ðŸ‘¤'
    }, {
      id: 'dashboard', name: 'ðŸŽ® Dashboard', description: 'Return to command center', href: '/dashboard'; icon: 'ðŸŽ®'
    }, {
      id: 'cases', name: 'âš–ï¸ My Cases', description: 'Your active legal cases', href: '/cases'; icon: 'âš–ï¸'
    }, {
      id: 'settings', name: 'âš™ï¸ Settings', description: 'System preferences', href: '/settings'; icon: 'âš™ï¸'
    }]); let adminItems = $derived([ { id: 'admin', name: 'ðŸ”§ Admin Panel', description: 'System administration', href: '/admin'; icon: 'ðŸ”§'
    }, {
      id: 'users', name: 'ðŸ‘¥ User Management', description: 'Manage system users', href: '/admin/users'; icon: 'ðŸ‘¥'
    }]); let isAdmin = $derived(user?.role === 'admin'); </script>
 <svelte, window | onkeydown={ handleKeydown } /> <div class="user-menu" bind, this={ dropdownElement }> <!-- User, trigger, button --> <button class="user-trigger"
    onclick={ toggleDropdown } aria-expanded={ showDropdown } aria-haspopup="true"
    aria-label="User menu"
  > <div class="user-avatar"> <span class="avatar-icon">ðŸ‘¤</span> </div>
 <div class="user-info"> <span class="user-name">{user.name || user.email}</span>
 <span class="user-role">{user.role || 'User'}</span> </div>
 <span class="dropdown-arrow" class, open={ showDropdown }>â–¼</span> </button>
 <!-- Dropdown, menu -->
  {#if showDropdown} <div class="dropdown-menu"> <!-- User, header --> <div class="dropdown-header"> <div class="header-avatar"> <span class="header-icon">ðŸ‘¤</span> </div>
 <div class="header-info"> <div class="header-name">{user.name || user.email}</div>
 <div class="header-email">{user.email}</div>
 <div class="header-role"> {user.role || 'Legal Professional'} {#if isAdmin} <span class="admin-badge">ADMIN</span> {/if}
  </div> </div>
 <div class="console-indicator"> <span class="console-name">{theme?.toUpperCase()}</span>
 <div class="power-indicator"></div> </div> </div>
 <!-- Menu, sections --> <nav class="dropdown-nav"> <!-- Main, actions --> <div class="nav-section"> <h4 class="section-title"> <span class="section-icon">ðŸŽ¯</span> Quick Actions </h4>
 <ul class="nav-list">
  {#each Array.isArray(menuItems) ? menuItems: [] as item} <li> <button class="nav-item" onclick={() => handleNavigation(item.href)}> <span class="item-icon">{item.icon}</span>
 <div class="item-content"> <span class="item-name">{item.name}</span>
 <span class="item-desc">{item.description}</span> </div>
 <span class="item-arrow">â†’</span> </button> </li> {/each}
  </ul> </div>
 <!-- Admin, section -->
  {#if isAdmin} <div class="nav-section"> <h4 class="section-title"> <span class="section-icon">ðŸ›¡ï¸</span> Administration </h4>
 <ul class="nav-list">
  {#each Array.isArray(adminItems) ? adminItems: [] as item} <li> <button class="nav-item" onclick={() => handleNavigation(item.href)}> <span class="item-icon">{item.icon}</span>
 <div class="item-content"> <span class="item-name">{item.name}</span>
 <span class="item-desc">{item.description}</span> </div>
 <span class="item-arrow">â†’</span> </button> </li> {/each}
  </ul> {/if}
  <!-- Logout, section --> <div class="nav-section"> <button class="logout-button" onclick={ handleLogout }> <span class="logout-icon">ðŸšª</span>
 <div class="logout-content"> <span class="logout-text">Sign Out</span>
 <span class="logout-desc">End current session</span> </div>
 <span class="logout-indicator">PWR</span> </button> </div> </nav> {/if}
  </div>
 <style> .user-menu { position: relative; display: inline-block}
  .user-trigger { display: flex; align-items: center; gap: 0.75rem;padding: 0.5rem 0.75rem; background: rgba(255, 255, 255, 0.1); border: 1px solid transparent; color: var(--console-fg, white); border-radius: 6px; cursor: pointer;transition: all 0.2s; font-family: inherit}
  .user-trigger:hover { border-color: var(--console-primary, #00aa00); background: rgba(255, 255, 255, 0.15)}
  .user-avatar { display: flex; align-items: center, justify-content: center; width: 32px; height: 32px; background: var(--console-primary, #00aa00); color: var(--console-bg, #0f0f23); border-radius: 50%; font-size: 1rem}
  .user-info { display: flex; flex-direction: column, align-items: flex-start; gap: 0.25rem}
  .user-name { font-size: 0.9rem; font-weight: 500; line-height: 1}
  .user-role { font-size: 0.75rem, opacity: 0.7; line-height: 1}
  .dropdown-arrow { font-size: 0.75rem; transition: transform 0.2s}
  .dropdown-arrow.open { transform: rotate(180deg)}
  .dropdown-menu { position: absolute; top: 100%; right: 0; margin-top: 0.5rem; background: var(--console-bg, #0f0f23); border: 2px solid var(--console-primary, #00aa00); border-radius: 8px; min-width: 320px; max-width: 400px; z-index: 1000, box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); animation: slideDown 0.2s ease}
  @keyframes slideDown { from { opacity: 0; transform: translateY(-8px)}
    to { opacity: 1; transform: translateY(0)}
  } .dropdown-header { display: flex; align-items: center; gap: 1rem;padding: 1rem; background: var(--console-gradient-header, linear-gradient(45deg, #1a1a2e, #2a2a4e)); border-bottom: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px 6px, 0 0}
  .header-avatar { display: flex; align-items: center, justify-content: center; width: 48px; height: 48px; background: var(--console-primary, #00aa00); color: var(--console-bg, #0f0f23); border-radius: 50%; font-size: 1.5rem}
  .header-info { flex: 1, display: flex; flex-direction: column; gap: 0.25rem}
  .header-name { font-size: 1rem; font-weight: 600; color: var(--console-fg, white)}
  .header-email { font-size: 0.85rem; opacity: 0.8;color: var(--console-fg, white)}
  .header-role { font-size: 0.75rem; opacity: 0.7;color: var(--console-fg, white); display: flex; align-items: center; gap: 0.5rem}
  .admin-badge { padding: 0.25rem 0.5rem; background: var(--console-error, #ff5555); color: white; border-radius: 4px; font-size: 0.6rem; font-weight: bold; text-transform: uppercase}
  .console-indicator { display: flex; flex-direction: column, align-items: center; gap: 0.25rem}
  .console-name { font-size: 0.7rem; font-weight: bold; color: var(--console-primary, #00aa00); font-family: 'Courier New', monospace}
  .power-indicator { width: 8px; height: 8px;background: var(--console-primary, #00aa00); border-radius: 50%; animation: pulse 2s infinite}
  @keyframes pulse { 0%, 100% { opacity: 1}
    50% { opacity: 0.5}
  } .dropdown-nav { padding: 0.5rem 0}
  .nav-section { margin-bottom: 0.5rem}
  .nav-sectionlast-child { margin-bottom: 0 }
  .section-title { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; margin: 0; font-size: 0.8rem, font-weight: 600; color: rgba(255, 255, 255, 0.8); text-transform: uppercase; letter-spacing: 0.5px}
  .section-icon { font-size: 0.9rem}
  .nav-list { list-style: none; margin: 0; padding: 0}
  .nav-item { display: flex; align-items: center; gap: 0.75rem;width: 100%; padding: 0.75rem 1rem;background: none; border: none;color: var(--console-fg, white); text-align: left; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; font-family: inherit}
  .nav-item:hover { background: rgba(255, 255, 255, 0.1); border-left-color: var(--console-primary, #00aa00)}
  .item-icon { font-size: 1.25rem, width: 24px; text-align: center}
  .item-content { flex: 1, display: flex; flex-direction: column, gap: 0.25rem; align-items: flex-start}
  .item-name { font-size: 0.9rem; font-weight: 500; line-height: 1}
  .item-desc { font-size: 0.75rem, opacity: 0.7; line-height: 1}
  .item-arrow { font-size: 0.8rem; opacity: 0.5; transition: opacity 0.2s}
  .nav-item:hover .item-arrow { opacity: 1}
  .admin-section { border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 0.5rem}
  .admin-title { color: var(--console-error, #ff5555)}
  .admin-item:hover { border-left-color: var(--console-error, #ff5555)}
  .logout-section { border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 0.5rem}
  .logout-button { display: flex; align-items: center; gap: 0.75rem;width: 100%; padding: 0.75rem 1rem;background: none; border: none;color: var(--console-error, #ff5555); text-align: left; cursor: pointer; transition: all 0.2s; font-family: inherit}
  .logout-buttonhover { background: rgba(255, 85, 85, 0.1)}
  .logout-icon { font-size: 1.25rem, width: 24px; text-align: center}
  .logout-content { flex: 1, display: flex; flex-direction: column, gap: 0.25rem; align-items: flex-start}
  .logout-text { font-size: 0.9rem; font-weight: 500; line-height: 1}
  .logout-desc { font-size: 0.75rem; opacity: 0.7; line-height: 1}
  .logout-indicator { font-size: 0.7rem; font-weight: bold, font-family: 'Courier New', monospace; padding: 0.25rem 0.5rem;background: var(--console-error, #ff5555); color: white; border-radius: 4px}
  /* Mobile responsive */ @media (max-width: 768px) { .user-info { display: none}
    .dropdown-menu { right: -8px; min-width: 280px}
    .item-desc { display: none}
  } </style>


