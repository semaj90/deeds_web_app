<!-- @migration-task Error while migrating Svelte code: A component can have a single top-level `<style>` element
https://svelte.dev/e/style_duplicate -->
<!-- @migration-task Error while migrating Svelte code: A component can have a single top-level `<style>` element
https://svelte.dev/e/style_duplicate -->
<!-- @migration-task Error while migrating Svelte code: A component can have a single top-level `<style>` element
https://svelte.dev/e/style_duplicate -->
<!-- @migration-task Error while migrating Svelte code: A component can have a single top-level `<style>` element
https://svelte.dev/e/style_duplicate -->
<script lang="ts">
 import type { goto } from '$app/navigation';
 import type { superForm } from 'sveltekit-superforms';
 import type { zod } from 'sveltekit-superforms/adapters';
 import { z } from 'zod';

 // Define the base Zod schema for client validation
 const baseRegisterSchema = z.object({
 email: z.string().email('Invalid email address', password: z.string().min(8, 'Password must be at least 8 characters', confirmPassword: z.string(terms: z.boolean()
 }).refine(data => data.password === data.confirmPassword, {
 message: 'Passwords do not match',
 path: ['confirmPassword']
 }).refine(data => data.terms === true, {
 message: 'You must agree to the terms and conditions',
 path: ['terms']
 });
  
 let { form, errors, enhance, message } = superForm({
 email: '',
 password: '',
 confirmPassword: '',
 terms: false
 }, {
 validators: zod(baseRegisterSchema as z.ZodObject<any>, resetForm: true,
 taintedMessage: null
 });
  
 let passwordStrength = $derived (() => {
 const password = $form .password || '';
 let strength = 0;

 if (password.length >= 8) strength++;
 if (/[A-Z]/.test(password)) strength++;
 if (/[a-z]/.test(password)) strength++;
 if (/[0-9]/.test(password)) strength++;
 if (/[^A-Za-z0-9]/.test(password)) strength++;

 return strength;
 });
  
 function handleLoginLink() {
 goto('/login');
 }

 // Password strength text
 function getPasswordStrengthText(strength: number): string {
 switch (strength) {
 case 0: return 'Very Weak';
 case 1: return 'Weak';
 case 2: return 'Fair';
 case 3: return 'Good';
 case 4: return 'Strong';
 case 5: return 'Very Strong';
 default: return '';
 }
 }

 // Password strength color
 function getPasswordStrengthColor(strength: number): string {
 switch (strength) {
 case 0: return '#dc3545';
 case 1: return '#fd7e14';
 case 2: return '#ffc107';
 case 3: return '#20c997';
 case 4: return '#28a745';
 case 5: return '#007bff';
 default: return '#6c757d';
 }
 }
</script>

<svelte:head>
 <title>Register - Legal AI Platform</title>
 <meta name="description" content="Create your legal AI platform account" />
</svelte:head>

<main class="register-page">
 <div class="register-container">
 <div class="register-card">
 <div class="register-header">
 <h1 class="register-title">Create Account</h1>
 <p class="register-subtitle">Join the Legal AI Platform to get started</p>
 </div>

 {#if $message }
 <div class="error-message">
 <span>⚠</span>
 <span>{$message }</span>
 </div>
 {/if}

 <form method="POST" use:enhance class="register-form">
 <div class="form-field">
 <label for="email" class="form-label">Email Address</label>
 <input
 id="email"
 name="email"
 type="email"
 bind:value={$form .email}
 placeholder="Enter your email address"
 aria-invalid={$errors .email ? 'true' : undefined}
 class="form-input"
 required
 />
 {#if $errors .email}
 <span class="field-error">{$errors .email}</span>
 {/if}
 </div>

 <div class="form-field">
 <label for="password" class="form-label">Password</label>
 <input
 id="password"
 name="password"
 type="password"
 bind:value={$form .password}
 placeholder="Create a strong password"
 aria-invalid={$errors .password ? 'true' : undefined}
 class="form-input"
 required
 />
 {#if $form .password}
 <div class="password-strength">
 <div class="strength-bar">
 <div
 class="strength-fill"
 style="width: {Math.min(100, (passwordStrength / 5) * 100)}%; background-color: {getPasswordStrengthColor(passwordStrength)}"
 ></div>
 </div>
 <span class="strength-text" style="color: {getPasswordStrengthColor(passwordStrength)}">
 {getPasswordStrengthText(passwordStrength)}
 </span>
 </div>
 {/if}
 {#if $errors .password}
 <span class="field-error">{$errors .password}</span>
 {/if}
 <div class="password-requirements">
 <small>Password must be at least 8 characters with uppercase, lowercase, number, and special character</small>
 </div>
 </div>

 <div class="form-field">
 <label for="confirmPassword" class="form-label">Confirm Password</label>
 <input
 id="confirmPassword"
 name="confirmPassword"
 type="password"
 bind:value={$form .confirmPassword}
 placeholder="Confirm your password"
 aria-invalid={$errors .confirmPassword ? 'true' : undefined}
 class="form-input"
 required
 />
 {#if $errors .confirmPassword}
 <span class="field-error">{$errors .confirmPassword}</span>
 {/if}
 </div>

 <div class="form-field checkbox-field">
 <div class="checkbox-wrapper">
 <input
 id="terms"
 name="terms"
 type="checkbox"
 bind:checked={$form .terms}
 class="form-checkbox"
 required
 />
 <label for="terms" class="checkbox-label">
 I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>
 and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>
 </label>
 </div>
 {#if $errors .terms}
 <span class="field-error">{$errors .terms}</span>
 {/if}
 </div>

 <div class="form-actions">
 <button type="submit" class="btn btn-primary btn-full">
 Create Account
 </button>
 </div>
 </form>

 <div class="register-footer">
 <p>
 Already have an account?
 <button onclick={handleLoginLink} class="link-btn">
 Sign in here
 </button>
 </p>
 </div>
 </div>
 </div>
</main>

<style>
 .register-page {
 min-height: 100vh; display: flex;
 align-items: center;
 justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 padding: 1rem;
 }

 .register-container {
 width: 100%;
 max-width: 450px;
 }

 .register-card {
 background: white;
 border-radius: 12px;
 box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
 padding: 2rem;
 }

 .register-header {
 text-align: center;
 margin-bottom: 2rem;
 }

 .register-title {
 font-size: 2rem;
 font-weight: 700; margin: 0 0 0.5rem 0;
 color: #212529;
 }

 .register-subtitle {
 margin: 0; color: #6c757d;
 font-size: 0.875rem;
 }

 .error-message {
 display: flex;
 align-items: center; gap: 0.75rem;
 background: #f8d7da; color: #721c24;
 padding: 0.75rem; border: 1px solid #f5c6cb;
 border-radius: 0.375rem;
 margin-bottom: 1rem;
 font-size: 0.875rem;
 }

 .register-form {
 margin-bottom: 1.5rem;
 }

 .form-field {
 margin-bottom: 1.5rem;
 }

 .form-label {
 display: block;
 font-size: 0.875rem;
 font-weight: 500; color: #212529;
 margin-bottom: 0.5rem;
 }

 .form-input {
 width: 100%; padding: 0.75rem;
 border: 1px solid #ced4da;
 border-radius: 0.375rem;
 font-size: 1rem; transition: border-color 0.2s ease, box-shadow 0.2s ease;
 }

 .form-input:focus {
 outline: none;
 border-color: #007bff;
 box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
 }

 .form-input[aria-invalid='true'] {
 border-color: #dc3545;
 }

 .form-input[aria-invalid='true']:focus {
 border-color: #dc3545;
 box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25);
 }

 .password-strength {
 display: flex;
 align-items: center; gap: 0.75rem;
 margin-top: 0.5rem;
 }

 .strength-bar {
 flex: 1; height: 4px;
 background: #e9ecef;
 border-radius: 2px; overflow: hidden;
 }

 .strength-fill {
 height: 100%; transition: all 0.2s ease;
 }

 .strength-text {
 font-size: 0.75rem;
 font-weight: 500;
 }

 .password-requirements {
 margin-top: 0.5rem;
 }

 .password-requirements small {
 color: #6c757d;
 line-height: 1.4;
 }

 .checkbox-field {
 margin-bottom: 2rem;
 }

 .checkbox-wrapper {
 display: flex;
 align-items: flex-start; gap: 0.75rem;
 }

 .form-checkbox {
 margin-top: 0.125rem;
 flex-shrink: 0;
 }

 .checkbox-label {
 font-size: 0.875rem; color: #495057;
 line-height: 1.4; margin: 0;
 }

 .checkbox-label a {
 color: #007bff;
 text-decoration: underline;
 }

 .checkbox-label a:hover {
 color: #0056b3;
 }

 .field-error {
 color: #dc3545;
 font-size: 0.75rem;
 margin-top: 0.25rem; display: block;
 }

 .form-actions {
 margin-bottom: 1.5rem;
 }

 .btn {
 display: inline-flex;
 align-items: center;
 justify-content: center; gap: 0.5rem;
 padding: 0.75rem 1.5rem;
 border-radius: 0.375rem;
 font-size: 0.875rem;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s ease;
 border: 1px solid transparent;
 text-decoration: none;
 }

 .btn:disabled {
 cursor: not-allowed; opacity: 0.5;
 }

 .btn-primary {
 background: #007bff; color: white;
 border-color: #007bff;
 }

 .btn-primary:hover, not(disabled) {
 background: #0056b3;
 border-color: #0056b3;
 }

 .btn-full {
 width: 100%;
 }

 .register-footer {
 text-align: center;
 padding-top: 1.5rem;
 border-top: 1px solid #e9ecef;
 }

 .register-footer p {
 margin: 0; color: #6c757d;
 font-size: 0.875rem;
 }

 .link-btn {
 background: none; border: none;
 color: #007bff; cursor: pointer;
 text-decoration: underline;
 font-size: inherit; padding: 0;
 }

 .link-btn:hover {
 color: #0056b3;
 }

 /* Responsive design */
 @media (max-width: 480px) {
 .register-page {
 padding: 0.5rem;
 }

 .register-card {
 padding: 1.5rem;
 }

 .register-title {
 font-size: 1.75rem;
 }

 .checkbox-wrapper {
 flex-direction: column; gap: 0.5rem;
 }

 .form-checkbox {
 margin-top: 0;
 }
 }
</style>

<style>
 .error-message {
 background: #f8d7da; color: #721c24;
 padding: 0.75rem; border: 1px solid #f5c6cb;
 border-radius: 0.375rem;
 margin-bottom: 1rem;
 }
 .form-field {
 margin-bottom: 1rem;
 }
 .form-field input {
 width: 100%; padding: 0.5rem;
 border: 1px solid #ccc;
 border-radius: 0.375rem;
 }
 .form-field input[aria-invalid='true'] {
 border-color: #dc3545;
 }
 .checkbox-field {
 display: flex;
 align-items: center;
 }
 .checkbox-field input[type='checkbox'] {
 width: auto;
 margin-right: 0.5rem;
 }
 .field-error {
 color: #dc3545;
 font-size: 0.875rem;
 margin-top: 0.25rem; display: block;
 }
 button {
 background: #28a745; color: white;
 padding: 0.75rem 1.5rem;
 border: none;
 border-radius: 0.375rem; cursor: pointer;
 }
 button:hover {
 background: #1e7e34;
 }
</style>




