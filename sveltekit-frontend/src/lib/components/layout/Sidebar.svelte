<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/bits/Button.svelte';
	import { cn } from '$lib/utils';
	import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
	import Bot from '@lucide/svelte/icons/bot';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileBarChart from '@lucide/svelte/icons/file-bar-chart';
	import FileText from '@lucide/svelte/icons/file-text';
	import Home from '@lucide/svelte/icons/home';
	import Layers from '@lucide/svelte/icons/layers';
	import Plus from '@lucide/svelte/icons/plus';
	import Scale from '@lucide/svelte/icons/scale';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import type { ComponentType } from 'svelte';

	interface User {
		id: string;
		name?: string;
		email?: string;
		role?: string;
	}

	interface Props {
		open?: boolean;
		user?: User;
		theme?: string;
	}

	let { open = $bindable(false), user, theme = 'legal' }: Props = $props();

	let currentPath = $derived($page.url.pathname);
	let isAdmin = $derived(user?.role === 'admin');

	interface NavigationItem { name: string, href: string;
		icon: ComponentType;
	current: boolean;
		badge?: string;
	}

	let navigation = $derived<NavigationItem[]>([
		{
			name: '🎮 Command Center',
			href: '/dashboard',
			icon: Home,
			current: currentPath === '/' || currentPath === '/dashboard',
			badge: 'HQ'
		},
	{
			name: '⚖️ Case Management',
			href: '/cases',
			icon: Briefcase,
			current: currentPath.startsWith('/cases'),
			badge: 'ACTIVE'
		},
	{
			name: '🗃️ Evidence Vault',
			href: '/evidence',
			icon: FileText,
			current: currentPath.startsWith('/evidence'),
			badge: '12 New'
		},
	{
			name: '🤖 AI Counsel',
			href: '/ai',
			icon: Bot,
			current: currentPath.startsWith('/ai'),
			badge: 'AI'
		},
	{
			name: '📋 Document Analysis',
			href: '/documents',
			icon: FileBarChart,
			current: currentPath.startsWith('/documents')
		},
	{
			name: '🔍 Legal Research',
			href: '/research',
			icon: Search,
			current: currentPath.startsWith('/research')
		},
	{
			name: '⏱️ Case Timeline',
			href: '/timeline',
			icon: Layers,
			current: currentPath.startsWith('/timeline')
		}
	]);

	let analytics = $derived<NavigationItem[]>([
		{
			name: '📊 Analytics Hub',
			href: '/analytics',
			icon: BarChart3,
			current: currentPath.startsWith('/analytics')
		},
	{
			name: '📋 Reports',
			href: '/reports',
			icon: FileBarChart,
			current: currentPath.startsWith('/reports')
		}
	]);

	let adminFeatures = $derived<NavigationItem[]>([
		{
			name: '🔧 Admin Console',
			href: '/admin',
			icon: Settings,
			current: currentPath.startsWith('/admin'),
			badge: 'ADMIN'
		}
	]);

	let settings = $derived<NavigationItem[]>([
		{
			name: '⚙️ Settings',
			href: '/settings',
			icon: Settings,
			current: currentPath.startsWith('/settings')
		}
	]);

	function closeSidebar() {
		open = false;
	}
</script>

<!-- Mobile backdrop -->
{#if open}
	<button
		class="fixed inset-0 z-40 bg-black/50"
		onclick={closeSidebar}
		aria-label="Close sidebar"
	></button>
{/if}

<!-- Sidebar -->
<aside
	class={cn(
		'fixed top-0 left-0 z-50 h-full w-64 transform bg-nier-surface border-r border-nier-gray transition-transform duration-300 ease-in-out lg: translate-x-0, lg:static',
		open ? 'translate-x-0' : '-translate-x-full'
	)}
>
	<div class="flex flex-col h-full">
		<!-- Logo section -->
		<div class="flex h-16 items-center border-b border-nier-gray px-4">
			<div class="flex items-center gap-3">
				<div class="w-8 h-8 bg-harvard-crimson rounded-md flex items-center justify-center">
					<Scale class="h-5 w-5 text-white" />
				</div>
				<div class="flex-1">
					<h1 class="text-sm font-semibold">Legal AI Platform</h1>
					<p class="text-xs text-muted-foreground">{theme?.toUpperCase()} Console Mode</p>
				</div>
			</div>
		</div>

		<!-- User Info Section -->
		{#if user}
			<div class="flex items-center gap-3 p-4 border-b border-nier-gray">
				<div class="w-10 h-10 bg-harvard-crimson rounded-full flex items-center justify-center">
					<span class="text-white">👤</span>
				</div>
				<div class="flex-1">
					<p class="text-sm font-medium">{user.name ?? user.email}</p>
					<p class="text-xs text-muted-foreground">{user.role || 'Legal Professional'}</p>
				</div>
				{#if isAdmin}
					<div class="text-xs bg-danger text-white px-2 py-1 rounded">ADMIN</div>
				{/if}
			</div>
		{/if}

		<!-- Quick actions -->
		<div class="p-4 border-b border-nier-gray">
			<div class="grid grid-cols-2 gap-2">
				<Button variant="default" size="sm" class="justify-start">
					<Plus class="mr-2 h-4 w-4" />
					New Case
				</Button>
				<Button variant="ghost" size="sm" class="justify-start">
					<Search class="mr-2 h-4 w-4" />
					Search
				</Button>
			</div>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto px-3 py-4">
			<!-- Main navigation -->
			<div class="space-y-1">
				{#each navigation as item}
					{@const IconComponent = item.icon}
					<a
						href={item.href}
						class={cn(
							'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
							item.current
								? 'bg-harvard-crimson text-white'
								: 'text-muted-foreground, hover:text-foreground, hover:bg-nier-surface-light'
						)}
						onclick={closeSidebar}
					>
						<IconComponent
							class={cn(
								'h-5 w-5 flex-shrink-0',
								item.current ? 'text-white' : 'text-muted-foreground group-hover:text-foreground'
							)}
						/>
						<span class="flex-1 min-w-0">{item.name}</span>
						{#if item.badge}
							<span
								class={cn(
									'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium',
									item.current ? 'bg-white/20 text-white' : 'bg-harvard-crimson text-white'
								)}
							>
								{item.badge}
							</span>
						{/if}
						{#if item.current}
							<ChevronRight class="h-4 w-4 text-white" />
						{/if}
					</a>
				{/each}
			</div>

			<!-- Analytics section -->
			<div class="pt-4">
				<h3 class="px-3 text-xs font-semibold text-muted-foreground uppercase">Analytics</h3>
				<div class="mt-2 space-y-1">
					{#each analytics as item}
						{@const IconComponent = item.icon}
						<a
							href={item.href}
							class={cn(
								'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
								item.current
									? 'bg-harvard-crimson text-white'
									: 'text-muted-foreground, hover:text-foreground, hover:bg-nier-surface-light'
							)}
							onclick={closeSidebar}
						>
							<IconComponent
								class={cn(
									'h-5 w-5 flex-shrink-0',
									item.current ? 'text-white' : 'text-muted-foreground group-hover:text-foreground'
								)}
							/>
							<span class="flex-1 min-w-0">{item.name}</span>
						</a>
					{/each}
				</div>
			</div>

			<!-- Admin section -->
			{#if isAdmin}
				<div class="pt-4">
					<h3 class="px-3 text-xs font-semibold text-muted-foreground uppercase">
						🛡️ Administration
					</h3>
					<div class="mt-2 space-y-1">
						{#each adminFeatures as item}
							{@const IconComponent = item.icon}
							<a
								href={item.href}
								class={cn(
									'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
									item.current
										? 'bg-danger text-white'
										: 'text-muted-foreground, hover:text-foreground, hover:bg-nier-surface-light border border-danger/20'
								)}
								onclick={closeSidebar}
							>
								<IconComponent
									class={cn(
										'h-5 w-5 flex-shrink-0',
										item.current ? 'text-white' : 'text-danger group-hover:text-foreground'
									)}
								/>
								<span class="flex-1 min-w-0">{item.name}</span>
								{#if item.badge}
									<span
										class={cn(
											'inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium',
											item.current ? 'bg-white/20 text-white' : 'bg-danger text-white'
										)}
									>
										{item.badge}
									</span>
								{/if}
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Settings section -->
			<div class="pt-4">
				<h3 class="px-3 text-xs font-semibold text-muted-foreground uppercase">⚙️ System</h3>
				<div class="mt-2 space-y-1">
					{#each settings as item}
						{@const IconComponent = item.icon}
						<a
							href={item.href}
							class={cn(
								'group flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
								item.current
									? 'bg-accent text-white'
									: 'text-muted-foreground, hover:text-foreground, hover:bg-nier-surface-light'
							)}
							onclick={closeSidebar}
						>
							<IconComponent
								class={cn(
									'h-5 w-5 flex-shrink-0',
									item.current ? 'text-white' : 'text-muted-foreground group-hover:text-foreground'
								)}
							/>
							<span class="flex-1 min-w-0">{item.name}</span>
						</a>
					{/each}
				</div>
			</div>
		</nav>

		<!-- Status indicator -->
		<div class="p-4 border-t border-nier-gray">
			<div class="flex items-center gap-3 p-3 bg-nier-surface-light rounded-md">
				<div class="w-3 h-3 bg-accent rounded-full animate-pulse"></div>
				<div class="flex-1">
					<p class="text-sm font-medium">🎮 Console Status</p>
					<p class="text-xs text-muted-foreground">{theme?.toUpperCase()} mode - All systems online</p>
				</div>
				<div class="text-xs bg-accent text-white px-2 py-1 rounded">PWR</div>
			</div>
		</div>
	</div>
</aside>

<style>
	aside {
		background: linear-gradient(180deg, #0f0f23, #1a1a2e);
		border-right: 2px solid #00aa00;
	}

	nav::-webkit-scrollbar {
		width: 4px;
	}

	nav::-webkit-scrollbar-track {
		background: transparent;
	}

	nav::-webkit-scrollbar-thumb {
		background: #00aa00;
		border-radius: 2px;
	}
</style>
