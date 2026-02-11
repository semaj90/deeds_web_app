<!-- Simplified Registration Form - Svelte 5 + Superforms v2 -->
<script lang="ts">
	import superForm from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';
	import { goto } from '$app/navigation';
	import Input from '$lib/components/ui/input/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Label from '$lib/components/ui/label/Label.svelte';
	import Shield from 'lucide-svelte/icons/shield';
	import UserPlus from 'lucide-svelte/icons/user-plus';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import Eye from 'lucide-svelte/icons/eye';
	import EyeOff from 'lucide-svelte/icons/eye-off';
	import Loader2 from 'lucide-svelte/icons/loader-2';

	// Props
	interface Props {
		data: any;
		redirectTo?: string;
		showLogin?: boolean;
	}

	let {
		data,
		redirectTo = '/dashboard',
		showLogin = true
	}: Props = $props();

	// Registration schema (Zod)
	const registerSchema = z.object({
		email: z.string().email('Please enter a valid email address'),
		firstName: z.string().min(1, 'First name is required'),
		lastName: z.string().min(1, 'Last name is required'),
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.regex(/[a-z]/, 'Password must contain lowercase letter')
			.regex(/[A-Z]/, 'Password must contain uppercase letter')
			.regex(/\d/, 'Password must contain number'),
		confirmPassword: z.string().min(1, 'Please confirm your password'),
		role: z.enum(['prosecutor', 'investigator', 'analyst', 'admin']).default('analyst'),
		department: z.string().min(1, 'Department is required'),
		jurisdiction: z.string().min(1, 'Jurisdiction is required'),
		badgeNumber: z.string().optional(),
		agreeToTerms: z.boolean().refine((val) => val === true, 'You must agree to the terms'),
		agreeToPrivacy: z.boolean().refine((val) => val === true, 'You must agree to the privacy policy'),
		enableTwoFactor: z.boolean().default(false)
	}).refine((data) => data.password === data.confirmPassword, {
		message: "Passwords don't match",
		path: ['confirmPassword']
	});

	// Superforms v2 setup
	const { form, errors, enhance, delayed, message } = superForm(data.form, {
		validators: zodClient(registerSchema),
		dataType: 'json',
		resetForm: false,
		onResult: ({ result }) => {
			if (result.type === 'success') {
				successMessage = 'Registration successful! Redirecting...';
				setTimeout(() => goto(redirectTo), 2000);
			}
		},
		onError: ({ result }) => {
			errorMessage = result.error?.message || 'Registration failed. Please try again.';
		}
	});

	// Local state
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');

	// Role options
	const roleOptions = [
		{ value: 'prosecutor', label: 'Prosecutor' },
		{ value: 'investigator', label: 'Investigator' },
		{ value: 'analyst', label: 'Legal Analyst' },
		{ value: 'admin', label: 'Administrator' }
	];

	// Password strength calculation
	function calculatePasswordStrength(password: string): {
		score: number;
		feedback: string;
		color: string;
	} {
		if (!password) return { score: 0, feedback: 'Enter a password', color: 'text-gray-400' };

		let score = 0;
		if (password.length >= 8) score += 2;
		if (password.length >= 12) score += 1;
		if (/[a-z]/.test(password)) score += 1;
		if (/[A-Z]/.test(password)) score += 1;
		if (/\d/.test(password)) score += 1;
		if (/[@$!%*?&]/.test(password)) score += 1;

		if (score < 3) return { score, feedback: 'Weak', color: 'text-red-500' };
		if (score < 5) return { score, feedback: 'Fair', color: 'text-yellow-500' };
		if (score < 7) return { score, feedback: 'Good', color: 'text-blue-500' };
		return { score, feedback: 'Excellent', color: 'text-green-500' };
	}

	let passwordStrength = $derived(calculatePasswordStrength($form.password || ''));
</script>

<div class="w-full max-w-2xl mx-auto">
	<div class="bg-white dark:bg-gray-900 p-8 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg">
		<!-- Header -->
		<div class="text-center mb-8">
			<div class="flex items-center justify-center gap-3 mb-2">
				<Shield class="h-8 w-8 text-blue-600 dark:text-blue-400" />
				<h1 class="text-2xl font-bold dark:text-white">Legal AI Platform</h1>
			</div>

			<div class="flex items-center justify-center gap-2 mb-2">
				<UserPlus class="h-5 w-5 text-gray-600 dark:text-gray-400" />
				<h2 class="text-xl font-semibold dark:text-white">Create Account</h2>
			</div>

			<p class="text-sm text-gray-600 dark:text-gray-400">
				Register as a legal professional to access the AI-powered legal system
			</p>
		</div>

		<!-- Error Message -->
		{#if errorMessage || $message}
			<div class="bg-red-50 dark:bg-red-900/20 border border-red-500 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4 flex items-center gap-2">
				<AlertCircle class="h-4 w-4 flex-shrink-0" />
				<span class="text-sm">{errorMessage || $message}</span>
			</div>
		{/if}

		<!-- Success Message -->
		{#if successMessage}
			<div class="bg-green-50 dark:bg-green-900/20 border border-green-500 text-green-700 dark:text-green-400 px-4 py-3 rounded mb-4 flex items-center gap-2">
				<Shield class="h-4 w-4 flex-shrink-0" />
				<span class="text-sm">{successMessage}</span>
			</div>
		{/if}

		<!-- Registration Form -->
		<form method="POST" action="?/register" use:enhance class="space-y-6">
			<!-- Personal Information -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- First Name -->
				<div class="space-y-2">
					<Label for="firstName">First Name <span class="text-red-500">*</span></Label>
					<Input
						id="firstName"
						name="firstName"
						type="text"
						placeholder="John"
						bind:value={$form.firstName}
						disabled={$delayed}
						required
						class:border-red-500={$errors.firstName}
					/>
					{#if $errors.firstName}
						<p class="text-sm text-red-500">{$errors.firstName}</p>
					{/if}
				</div>

				<!-- Last Name -->
				<div class="space-y-2">
					<Label for="lastName">Last Name <span class="text-red-500">*</span></Label>
					<Input
						id="lastName"
						name="lastName"
						type="text"
						placeholder="Smith"
						bind:value={$form.lastName}
						disabled={$delayed}
						required
						class:border-red-500={$errors.lastName}
					/>
					{#if $errors.lastName}
						<p class="text-sm text-red-500">{$errors.lastName}</p>
					{/if}
				</div>
			</div>

			<!-- Email -->
			<div class="space-y-2">
				<Label for="email">Official Email Address <span class="text-red-500">*</span></Label>
				<Input
					id="email"
					name="email"
					type="email"
					placeholder="john.smith@prosecutor.gov"
					bind:value={$form.email}
					disabled={$delayed}
					required
					class:border-red-500={$errors.email}
				/>
				{#if $errors.email}
					<p class="text-sm text-red-500">{$errors.email}</p>
				{/if}
			</div>

			<!-- Professional Information -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- Role -->
				<div class="space-y-2">
					<Label for="role">Professional Role <span class="text-red-500">*</span></Label>
					<select
						id="role"
						name="role"
						bind:value={$form.role}
						disabled={$delayed}
						required
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
						class:border-red-500={$errors.role}
					>
						{#each roleOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					{#if $errors.role}
						<p class="text-sm text-red-500">{$errors.role}</p>
					{/if}
				</div>

				<!-- Badge Number -->
				<div class="space-y-2">
					<Label for="badgeNumber">Badge/ID Number (Optional)</Label>
					<Input
						id="badgeNumber"
						name="badgeNumber"
						type="text"
						placeholder="12345"
						bind:value={$form.badgeNumber}
						disabled={$delayed}
					/>
				</div>
			</div>

			<!-- Department & Jurisdiction -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="department">Department/Agency <span class="text-red-500">*</span></Label>
					<Input
						id="department"
						name="department"
						type="text"
						placeholder="District Attorney's Office"
						bind:value={$form.department}
						disabled={$delayed}
						required
						class:border-red-500={$errors.department}
					/>
					{#if $errors.department}
						<p class="text-sm text-red-500">{$errors.department}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="jurisdiction">Jurisdiction <span class="text-red-500">*</span></Label>
					<Input
						id="jurisdiction"
						name="jurisdiction"
						type="text"
						placeholder="Los Angeles County"
						bind:value={$form.jurisdiction}
						disabled={$delayed}
						required
						class:border-red-500={$errors.jurisdiction}
					/>
					{#if $errors.jurisdiction}
						<p class="text-sm text-red-500">{$errors.jurisdiction}</p>
					{/if}
				</div>
			</div>

			<!-- Password Fields -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- Password -->
				<div class="space-y-2">
					<Label for="password">Password <span class="text-red-500">*</span></Label>
					<div class="relative">
						<Input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							placeholder="Enter secure password"
							bind:value={$form.password}
							disabled={$delayed}
							required
							class="pr-10"
							class:border-red-500={$errors.password}
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
							onclick={() => (showPassword = !showPassword)}
							disabled={$delayed}
						>
							{#if showPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>

					{#if $form.password}
						<div class="flex items-center gap-2">
							<div class="h-2 flex-1 bg-gray-200 dark:bg-gray-700 rounded">
								<div
									class="h-full rounded transition-all"
									class:bg-red-500={passwordStrength.score < 3}
									class:bg-yellow-500={passwordStrength.score >= 3 && passwordStrength.score < 5}
									class:bg-blue-500={passwordStrength.score >= 5 && passwordStrength.score < 7}
									class:bg-green-500={passwordStrength.score >= 7}
									style="width: {Math.min(100, (passwordStrength.score / 8) * 100)}%"
								></div>
							</div>
							<span class="text-sm {passwordStrength.color}">{passwordStrength.feedback}</span>
						</div>
					{/if}

					{#if $errors.password}
						<p class="text-sm text-red-500">{$errors.password}</p>
					{/if}
				</div>

				<!-- Confirm Password -->
				<div class="space-y-2">
					<Label for="confirmPassword">Confirm Password <span class="text-red-500">*</span></Label>
					<div class="relative">
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type={showConfirmPassword ? 'text' : 'password'}
							placeholder="Confirm your password"
							bind:value={$form.confirmPassword}
							disabled={$delayed}
							required
							class="pr-10"
							class:border-red-500={$errors.confirmPassword}
						/>
						<button
							type="button"
							class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
							onclick={() => (showConfirmPassword = !showConfirmPassword)}
							disabled={$delayed}
						>
							{#if showConfirmPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>

					{#if $errors.confirmPassword}
						<p class="text-sm text-red-500">{$errors.confirmPassword}</p>
					{/if}
				</div>
			</div>

			<!-- Security Options -->
			<div class="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
				<h3 class="text-sm font-semibold dark:text-white">Security Options</h3>

				<label class="flex items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						id="enableTwoFactor"
						name="enableTwoFactor"
						bind:checked={$form.enableTwoFactor}
						disabled={$delayed}
						class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
					/>
					<span class="text-sm dark:text-gray-200">
						Enable two-factor authentication (recommended for legal professionals)
					</span>
				</label>
			</div>

			<!-- Terms and Privacy -->
			<div class="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
				<label class="flex items-start gap-2 cursor-pointer">
					<input
						type="checkbox"
						id="agreeToTerms"
						name="agreeToTerms"
						bind:checked={$form.agreeToTerms}
						disabled={$delayed}
						required
						class="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
						class:border-red-500={$errors.agreeToTerms}
					/>
					<span class="text-sm dark:text-gray-200">
						I agree to the <a href="/legal/terms" class="text-blue-600 dark:text-blue-400 hover:underline">Terms of Service</a>
					</span>
				</label>
				{#if $errors.agreeToTerms}
					<p class="text-sm text-red-500">{$errors.agreeToTerms}</p>
				{/if}

				<label class="flex items-start gap-2 cursor-pointer">
					<input
						type="checkbox"
						id="agreeToPrivacy"
						name="agreeToPrivacy"
						bind:checked={$form.agreeToPrivacy}
						disabled={$delayed}
						required
						class="mt-0.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
						class:border-red-500={$errors.agreeToPrivacy}
					/>
					<span class="text-sm dark:text-gray-200">
						I agree to the <a href="/legal/privacy" class="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</a>
					</span>
				</label>
				{#if $errors.agreeToPrivacy}
					<p class="text-sm text-red-500">{$errors.agreeToPrivacy}</p>
				{/if}
			</div>

			<!-- Submit Button -->
			<Button type="submit" class="w-full gap-2" disabled={$delayed}>
				{#if $delayed}
					<Loader2 class="h-4 w-4 animate-spin" />
					Creating Account...
				{:else}
					<UserPlus class="h-4 w-4" />
					Create Legal Professional Account
				{/if}
			</Button>
		</form>

		<!-- Login Link -->
		{#if showLogin}
			<div class="mt-6 text-center">
				<p class="text-sm text-gray-600 dark:text-gray-400">
					Already have an account?
					<a
						href="/auth/login"
						class="text-blue-600 dark:text-blue-400 hover:underline font-medium"
						tabindex={$delayed ? -1 : 0}
					>
						Sign in here
					</a>
				</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.animate-fade-in {
		animation: fadeIn 0.18s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
