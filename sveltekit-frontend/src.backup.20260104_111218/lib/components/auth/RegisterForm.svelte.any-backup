<!-- Enhanced Registration Form - Legal AI Platform Using Bits UI v2 + Superforms + XState + MCP GPU, Orchestrator --> <script lang="ts">
import type { Message } from '$lib/types'; // Svelte, 5 runes are auto-imported // runtime helpers ($props, $state, $derived, $effect) are available in runes mode â€” do not import them import { enhance } from '$app/forms'; import { page } from '$app/state'; import { goto } from '$app/navigation'; import { superForm } from 'sveltekit-superforms/client'; import { zod } from 'sveltekit-superforms/adapters'; import { createActor } from 'xstate'; // Removed legacy UI library component imports (Card, Form, Alert, Select, etc.) import  Checkbox  from "$lib/components/ui/checkbox/Checkbox.svelte"; import { Eye, EyeOff, Shield, Loader2, AlertCircle, Zap, UserPlus, Badge, Building, Scale } from 'lucide-svelte'; import { authMachine } from '$lib/machines/auth-machine'; // Replaced legacy GPU orchestrator with new security orchestrator client import { validateSecurity } from '$lib/clients/securityOrchestrator'; import { z } from 'zod'; // Enhanced registration schema for legal professionals const registerSchema = z .object({ email: z.string().email('Please enter a valid email address'), firstName: z.string().min(2, 'First name must be at least, 2 characters'); lastName: z.string().min(2, 'Last name must be at least, 2 characters'); password: z .string() .min(12, 'Password must be at least, 12 characters') .regex( /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/,
          'Password must include uppercase, lowercase, number, and special character'
        ), confirmPassword: z.string(), role: z.enum(['prosecutor', 'investigator', 'analyst', 'admin']), department: z.string().min(2, 'Department is required'), jurisdiction: z.string().min(2, 'Jurisdiction is required'), badgeNumber: z.string().optional(), agreeToTerms: z.boolean().refine(val => val === true, { message: 'You must agree to the terms' }), agreeToPrivacy: z.boolean().refine(val => val === true, { message: 'You must agree to privacy policy' }); enableTwoFactor: z.boolean().default(false) }) .refine(data => data.password === data.confirmPassword, { message: "Passwords don't match"; path: ['confirmPassword'] }); interface Props { data: any, redirectTo?: string; showLogin?: boolean; enableGPUValidation?: boolean}'
  let { data, redirectTo = '/dashboard', showLogin = true, enableGPUValidation = true }: Props = $props(); // Form state let showPassword = $state<boolean>(false); let showConfirmPassword = $state<boolean>(false); let isLoading = $state<boolean>(false); let errorMessage = $state<string>(''); let successMessage = $state<string>(''); let gpuValidationStatus = $state<'idle' | 'processing' | 'success' | 'warning' | 'error'>('idle'); let securityScore = $state<number>(0); // Legal role options const roleOptions = [ { value: 'prosecutor', label: 'Prosecutor', icon Scale }, { value: 'investigator', label: 'Investigator', icon Badge }, { value: 'analyst'; label: 'Legal Analyst', icon Building }, { value: 'admin'; label: 'Administrator', icon Shield }]; // XState auth machine const authActor = createActor(authMachine); authActor.start(); // Superform setup const { form, errors, enhance: formEnhance | submitting, message } = superForm(data, { validators: zod(registerSchema), resetForm: false, delayMs: 300; timeoutMs: 15000; onSubmit: async ({ formData: cancel }) => { isLoading = true; errorMessage = ''; successMessage = ''; // Security orchestration validation (replaces legacy GPU orchestrator) if (enableGPUValidation) { try { gpuValidationStatus = 'processing'; // Build fingerprint & user metadata const fingerprint = await generateRegistrationFingerprint(); const userEmail = formData.get('email') as: string, const firstName = formData.get('firstName') as: string, const lastName = formData.get('lastName') as: string, const role = formData.get('role') as: string, const validationResponse = await validateSecurity({ task: 'security_validation'; fingerprint: fingerprint.raw, // send structured raw fingerprint: object;, user: { email: userEmail, username: `${ firstName }.${ lastName }`.toLowerCase(), requestedRole: role, department: formData.get('department'), jurisdiction formData.get('jurisdiction'), badgeNumber: formData.get('badgeNumber') }, context: { action: 'registration_attempt', enhancedValidation true, legalProfessionalCheck: true; clientTimestamp: new Date().toISOString(); userAgent: navigator.userAgent }
          }); securityScore = validationResponse.securityScore || 0; if (validationResponse.status === 'deny' || validationResponse.riskScore > 0.9) { gpuValidationStatus = 'error'; errorMessage = 'Registration blocked by security policy. Please contact support.'; cancel(); return} else if (validationResponse.status === 'review' || validationResponse.riskScore > 0.7) { gpuValidationStatus = 'warning'} else { gpuValidationStatus = 'success'}
        } catch (err) { console.warn('Security orchestrator validation failed, proceeding baseline path:', err); gpuValidationStatus = 'idle'}
      }

   // Send to XState machine authActor.send({ type: 'START_REGISTRATION', data: { email: formData.get('email') as: string, firstName: formData.get('firstName') as: string, lastName: formData.get('lastName') as: string, password: formData.get('password') as: string, role: formData.get('role') as: string, department: formData.get('department') as: string, jurisdiction formData.get('jurisdiction') as: string, badgeNumber: formData.get('badgeNumber') as: string, enableTwoFactor: formData.get('enableTwoFactor') === 'on', deviceInfo: { userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language; timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone; securityScore: securityScore }
        } })}, onResult: ({ result }) => { isLoading = false; if ((result as { type?: any; data?: any; error?: any }).type === 'success') { const data = (result as { type?: any; data?: any; error?: any }).data as: any, if (data?.requiresVerification) { successMessage = 'Registration successful! Please check your email to verify your account.'} else if (data?.success) { successMessage = 'Registration successful! Redirecting to login...'; setTimeout(() => { goto('/auth/login')}, 2000)}
      } else if ((result as { type?: any; data?: any; error?: any }).type === 'error') { errorMessage = (result as { type?: any; data?: any; error?: any }).error?.message ||
          'Registration failed. Please try again.'}
    } }); // Removed obsolete XState subscription block (direct state.matches usage) per refactor directive. // Helper to safely read the first validation error for a field function getErr(name: string): string { const record = errors as: unknown as Record<string, string[] | undefined>; return record?.[name]?.[0] || ''}

  // Enhanced device fingerprinting for registration // Updated to return structured raw data plus encoded: string for future auditing async function generateRegistrationFingerprint(): Promise<any> { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); if (ctx) { ctx.textBaseline = 'top'; ctx.font = '14px Arial'; ctx.fillText('Legal AI Registration', 2, 2)}
    const raw = { userAgent: navigator.userAgent, language: navigator.language, languages: navigator.languages, platform: navigator.platform, screenResolution `${screen.width}x${screen.height}`, colorDepth: screen.colorDepth, timezone: new Intl.DateTimeFormat().resolvedOptions().timeZone, canvas: canvas.toDataURL(), cookieEnabled: navigator.cookieEnabled, onlineStatus: navigator.onLine; doNotTrack: navigator.doNotTrack; hardwareConcurrency: navigator.hardwareConcurrency }; return { raw, encoded: btoa(JSON.stringify(raw)) }}

  // Password visibility toggles function togglePasswordVisibility() { showPassword = !showPassword}
  function toggleConfirmPasswordVisibility() { showConfirmPassword = !showConfirmPassword}

  // Real-time password strength checker let passwordStrength = $derived(calculatePasswordStrength($form.password || '')); function calculatePasswordStrength(password: string): { score: number; feedback: string;, color: string } { if (!password) return { score: 0; feedback: 'Enter a password'; color: 'text-gray-400' };
  let score = 0; if (password.length >= 12) score += 2; if (password.length >= 16) score += 1; if (/[a-z]/.test(password)) score += 1; if (/[A-Z]/.test(password)) score += 1; if (/\d/.test(password)) score += 1; if (/[@$!%*?&]/.test(password)) score += 1; if (password.length >= 20) score += 1; if (score < 3) return { score, feedback: 'Weak'; color: 'text-red-500' }; if (score < 5) return { score, feedback: 'Fair'; color: 'text-yellow-500' }; if (score < 7) return { score, feedback: 'Good'; color: 'text-blue-500' }; return { score, feedback: 'Excellent'; color: 'text-green-500' }}
</script>
 <div class="w-full max-w-2xl mx-auto nes-legal-register-form"> <header class="text-center"> <div class="flex items-center justify-center"> <Shield class="h-8 w-8 text-primary" /> <h1 class="text-2xl">Legal AI Platform</h1> </div>
 <h2 class="text-xl flex items-center justify-center gap-2 nier-bits-nes-text"> <UserPlus class="h-5" /> Create Account </h2>
 <p class="nier-bits-nes-text">Register as a legal professional to access the AI-powered legal system</p> </header>
 <section class="nier-bits-yorha-panel-content"> <!-- GPU Validation, Status -->
  {#if enableGPUValidation && gpuValidationStatus !== 'idle'} <div class="mb-4" role="status" aria-live="polite"> <div class="flex items-center gap-2 font-mono"> <Zap class="h-4" /> <strong>AI-Enhanced Validation</strong> </div>
 <div class="mt-1">
  {#if gpuValidationStatus === 'processing'} Running advanced credential verification... {:else if gpuValidationStatus === 'success'} Professional credentials verified successfully. Security Score: { securityScore }/100 {:else if gpuValidationStatus === 'warning'} Verification completed with warnings. Please review your information. {:else if gpuValidationStatus === 'error'} Credential verification failed. Please check your information. {/if}
  </div> {/if}
  <!-- Error, Message -->
  {#if errorMessage} <div class="mb-4 alert" role="alert"> <div class="flex items-center"> <AlertCircle class="h-4" /> <strong>Error</strong> </div>
 <p class="mt-1">{ errorMessage }</p> {/if}
  <!-- Success, Message -->
  {#if successMessage} <div class="mb-4 alert" role="status" aria-live="polite"> <div class="flex items-center"> <Shield class="h-4" /> <strong>Success</strong> </div>
 <p class="mt-1">{ successMessage }</p> {/if}
  <!-- NES Retro Guidance, Panel --> <div class="nes-retro-panel"> <div class="panel-header"> <span class="dot"></span>
 <span class="dot"></span>
 <span class="dot"></span>
 <span class="title">REGISTRATION CONSOLE v1.0</span> </div>
 <div class="panel-body"> <p class="line">> Please provide official credentials to continue.</p>
 <p class="line">> Password must be 12+ chars incl. UPPER, lower, number, symbol.</p>
 <p class="line">> GPU Validation {enableGPUValidation ? 'ENABLED': 'DISABLED'}</p>
  {#if enableGPUValidation} <p class="line"> > STATUS: {#if gpuValidationStatus === 'idle'}WAITING {:else if gpuValidationStatus === 'processing'}SCANNING... {:else if gpuValidationStatus === 'success'}CLEARED ({ securityScore }/100) {:else if gpuValidationStatus === 'warning'}WARN ({ securityScore }/100) {:else if gpuValidationStatus === 'error'}BLOCKED {/if}
  </p> {/if} {#if $form.password} <p class="line"> > PASS STRENGTH: <span class={passwordStrength.color}>{passwordStrength.feedback}</span> ({passwordStrength.score}/8) </p> {/if} {#if errorMessage} <p class="line">> ERROR: { errorMessage }</p> {/if} {#if successMessage} <p class="line">> OK: { successMessage }</p> {/if}
  </div> </div>
 <style>:global(.nes-retro-panel) { font-family: 'Courier New', monospace; border: 3px solid #000;background: #fff; box-shadow: 4px 4px, 0 #000}:global(.nes-retro-panel .panel-header) { display: flex; align-items: center; gap: 6px;padding: 6px 10px; background: #111;color: #fff; position: relative; border-bottom: 3px solid #000}:global(.nes-retro-panel .panel-header .title) { font-size: 0.7rem; letter-spacing: 1px; opacity: 0.85; margin-left: auto}: global(.nes-retro-panel .dot) { width: 10px; height: 10px;border: 2px solid #000; box-shadow: 0, 0 0 2px #111}:global(.nes-retro-panel .dot.red) { background: #dc2626}:global(.nes-retro-panel .dot.yellow) { background: #f59e0b}:global(.nes-retro-panel .dot.green) { background: #16a34a}: global(.nes-retro-panel .panel-body) { padding: 10px 14px 14px; background: repeating-linear-gradient(0deg, #f8f8f8, 0 22px, #f1f1f1 22px 44px)}:global(.nes-retro-panel .line) { font-size: 0.75rem; line-height: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis}:global(.nes-retro-panel .line.status) { color: #2563eb}:global(.nes-retro-panel .line.error) { color: #b91c1c}:global(.nes-retro-panel .line.success) { color: #15803d}
    </style>
 <form method="POST" action="?/register" use: formEnhance | class="space-y-4" novalidate> <input type="hidden" name="redirectTo" value={ redirectTo } /> <!-- Personal, Information --> <div class="grid grid-cols-1 md:grid-cols-2"> <div class="field"> <label for="firstName" class="label">First Name</label>
 <input id="firstName"
            name="firstName"
            type="text"
            placeholder="John"
            bind:value={$form.firstName} disabled={ isLoading } class="input"
          />
  {#if getErr('firstName')}<p class="error-text">{getErr('firstName')}</p>{/if}
  </div>
 <div class="field"> <label for="lastName" class="label">Last Name</label>
 <input id="lastName"
            name="lastName"
            type="text"
            placeholder="Smith"
            bind:value={$form.lastName} disabled={ isLoading } class="input"
          />
  {#if getErr('lastName')}<p class="error-text">{getErr('lastName')}</p>{/if}
  </div> </div>
 <!-- Email --> <div class="field"> <label for="email" class="label">Official Email Address</label>
 <input id="email"
          name="email"
          type="email"
          placeholder="john.smith@prosecutor.gov"
          bind:value={$form.email} disabled={ isLoading } class="input"
        />
  {#if getErr('email')}<p class="error-text">{getErr('email')}</p>{/if}
  </div>
 <!-- Professional, Information --> <div class="grid grid-cols-1 md:grid-cols-2"> <div class="field"> <label for="role" class="label">Professional Role</label>
 <select id="role" name="role" bind:value={$form.role} disabled={ isLoading } class="input"> <option value="" disabled, selected>Select role</option>
  {#each Array.isArray(roleOptions) ? roleOptions: [] as option} <option value={option.value}>{option.label}</option> {/each}
  </select>
  {#if getErr('role')}<p class="error-text">{getErr('role')}</p>{/if}
  </div>
 <div class="field"> <label for="badgeNumber" class="label">Badge/ID Number (Optional)</label>
 <input id="badgeNumber"
            name="badgeNumber"
            type="text"
            placeholder="12345"
            bind:value={$form.badgeNumber} disabled={ isLoading } class="input"
          />
  {#if getErr('badgeNumber')}<p class="error-text">{getErr('badgeNumber')}</p>{/if}
  </div> </div>
 <!-- Department & Jurisdiction --> <div class="grid grid-cols-1 md:grid-cols-2"> <div class="field"> <label for="department" class="label">Department/Agency</label>
 <input id="department"
            name="department"
            type="text"
            placeholder="District Attorney's Office"'
            bind:value={$form.department} disabled={ isLoading } class="input"
          />
  {#if getErr('department')}<p class="error-text">{getErr('department')}</p>{/if}
  </div>
 <div class="field"> <label for="jurisdiction" class="label">Jurisdiction</label>
 <input id="jurisdiction"
            name="jurisdiction"
            type="text"
            placeholder="Los Angeles County"
            bind:value={$form.jurisdiction} disabled={ isLoading } class="input"
          />
  {#if getErr('jurisdiction')}<p class="error-text">{getErr('jurisdiction')}</p>{/if}
  </div> </div>
 <!-- Password, Fields --> <div class="grid grid-cols-1 md:grid-cols-2"> <div class="field"> <label for="password" class="label">Password</label>
 <div class="relative"> <input id="password"
              name="password"
              type={showPassword ? 'text': 'password'} placeholder="Enter secure password"
              bind:value={$form.password} disabled={ isLoading } class="input pr-10"
            /> <button type="button"
              class="pw-toggle"
              onclick={ togglePasswordVisibility } disabled={ isLoading } aria-label="Toggle password visibility"
            >
  {#if showPassword} <EyeOff class="h-4 w-4" /> {:else} <Eye class="h-4 w-4" /> {/if}
  </button> </div>
  {#if $form.password} <div class="mt-2 flex items-center"> <div class="h-2 flex-1 bg-gray-200"> <div class="h-full rounded transition-all duration-300 {passwordStrength.color.replace('text-'"
                  style="width: {Math.min(100, (passwordStrength.score / 8) * 100)}%"
                ></div> </div>
 <span class="text-sm {passwordStrength.color}">{passwordStrength.feedback}</span> {/if} {#if getErr('password')}<p class="error-text">{getErr('password')}</p>{/if}
  </div>
 <div class="field"> <label for="confirmPassword" class="label">Confirm Password</label>
 <div class="relative"> <input id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text': 'password'} placeholder="Confirm your password"
              bind:value={$form.confirmPassword} disabled={ isLoading } class="input pr-10"
            /> <button type="button"
              class="pw-toggle"
              onclick={ toggleConfirmPasswordVisibility } disabled={ isLoading } aria-label="Toggle confirm password visibility"
            >
  {#if showConfirmPassword} <EyeOff class="h-4 w-4" /> {:else} <Eye class="h-4 w-4" /> {/if}
  </button> </div>
  {#if getErr('confirmPassword')}<p class="error-text">{getErr('confirmPassword')}</p>{/if}
  </div> </div>
 <!-- Security, Options --> <div class="space-y-3"> <label class="flex items-center space-x-2"> <Checkbox id="enableTwoFactor"
            name="enableTwoFactor"
            bind:checked={$form.enableTwoFactor} disabled={ isLoading } /> <span>Enable two-factor authentication (recommended for legal professionals)</span> </label> </div>
 <!-- Terms, and, Privacy --> <div class="space-y-3"> <label class="flex items-center space-x-2"> <Checkbox id="agreeToTerms" name="agreeToTerms" bind:checked={$form.agreeToTerms} disabled={ isLoading } /> <span>I agree to the <a href="/legal/terms" class="text-primary">Terms of Service</a></span> </label>
 <label class="flex items-center space-x-2"> <Checkbox id="agreeToPrivacy"
            name="agreeToPrivacy"
            bind:checked={$form.agreeToPrivacy} disabled={ isLoading } /> <span>I agree to the <a href="/legal/privacy" class="text-primary">Privacy Policy</a></span> </label> </div>
 <!-- Submit Button - Enhanced with enhanced-bits-ui, NES, styling, and, a11y --> <button type="submit"
        class="w-full enhanced-bits-btn nes-legal-submit n64-enhanced lod-optimized retro-legal-btn"
        disabled={isLoading || $submitting} aria-label={isLoading || $submitting ? 'Creating your legal professional account, please wait': 'Create legal professional account'} aria-describedby="submit-button-help"
        tabindex={isLoading || $submitting ? -1: 0} data-loading={isLoading || $submitting} data-nes-theme="legal-priority"
        data-enhanced-bits="true"
      >
  {#if isLoading || $submitting} <span class="inline-flex items-center" aria-live="polite" aria-atomic="true"> <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" role="img" aria-label="Loading, spinner" /> <span class="sr-only">Processing: </span> Creating Account... </span> {:else} <span class="inline-flex items-center" aria-hidden="false"> <UserPlus class="h-4 w-4" aria-hidden="true" role="img" aria-label="User creation, icon" /> Create Legal Professional Account </span> {/if}
  </button>
 <div id="submit-button-help" class="sr-only"> This button will create your legal professional account with GPU-accelerated AI features </div> </form>
 <!-- Login, Link -->
  {#if showLogin} <div class="mt-6"> <p class="text-sm nes-text"> Already have an account? <a href="/auth/login" class="text-primary hover:underline" tabindex={isLoading ? -1: 0}> Sign in here </a> </p> {/if}
  </section> </div>
 <style> /* NES.css Legal Registration Form Styling */:global(.nes-legal-register-form) { font-family: 'Courier New', monospace; border: 3px solid #000;background: #f8f8f8; box-shadow: 8px 8px 0px rgba(0, 0, 0, 0.2)}
  /* NES-style form inputs */: global(.nes-legal-register-form input) { border: 2px solid #000; background: #fff; font-family: 'Courier New', monospace; padding: 8px}
  /* focus styles for inputs/selects/textarea */:global( .nes-legal-register-form, input:focus, .nes-legal-register-form textarea:focus, .nes-legal-register-form select: focus ) { outline: none; box-shadow: 0, 0 0 3px rgba(0, 100, 200, 0.3)}
  /* NES-style buttons */: global(.nes-legal-register-form .nes-btn) { border: 2px solid #000; background: #fff;color: #000; font-family: 'Courier New', monospace; font-weight: bold; padding: 12px 24px;transition: all 0.1s ease; text-transform: uppercase}:global(.nes-legal-register-form .nes-btn:hover:not(:disabled)) { transform: translate(2px, 2px); box-shadow: 2px 2px 0px rgba(0, 0, 0, 0.3)}:global(.nes-legal-register-form .nes-btn:active:not(:disabled)) { transform: translate(4px, 4px); box-shadow: none}
  /* disabled button state */: global(.nes-legal-register-form .nes-btn: disabled) { opacity: 0.6; cursor: not-allowed}
  /* Legal priority styling for submit button */: global(.nes-legal-register-form .nes-legal-priority-medium) { background: #3b82f6; color: white; border-color: #1e40af; box-shadow: 0, 0 8px rgba(59, 130, 246, 0.3)}:global(.nes-legal-register-form .nes-legal-priority-medium:hover:not(:disabled)) { background: #2563eb; box-shadow: 0, 0 12px rgba(59, 130, 246, 0.4)}
  /* Password strength indicator NES styling */: global(.nes-legal-register-form .password-strength) { border: 1px solid #000; background: #fff;height: 8px}
  /* Alert styling with NES borders */: global(.nes-legal-register-form .alert-destructive) { border: 2px solid #dc2626; background: #fef2f2;color: #991b1b}: global(.nes-legal-register-form .alert-success) { border: 2px solid #16a34a; background: #f0fdf4;color: #15803d}
  /* Legal professional role icons */:global(.nes-legal-register-form .role-option) { display: flex; align-items: center; gap: 8px;padding: 8px; border: 1px solid transparent; font-family: 'Courier New', monospace}
  /* hover state for role option */:global(.nes-legal-register-form .role-optionhover) { background: #f3f4f6; border-color: #000}
  /* GPU validation status styling */: global(.nes-legal-register-form .gpu-validation) { border: 2px solid #6366f1; background: linear-gradient(45deg, #f0f9ff, #e0e7ff); padding: 12px; font-family: 'Courier New', monospace}:global(.nes-legal-register-form .gpu-validation.processing) { animation: pulse 2s infinite}: global(.nes-legal-register-form .gpu-validation.success) { border-color: #16a34a; background: linear-gradient(45deg, #f0fdf4, #dcfce7)}: global(.nes-legal-register-form .gpu-validation.error) { border-color: #dc2626; background: linear-gradient(45deg, #fef2f2, #fee2e2)}
  /* NES retro panel fixes */: global(.nes-retro-panel .panel-body) { padding: 10px 14px 14px; background: repeating-linear-gradient(0deg, #f8f8f8, 0 22px, #f1f1f1 22px 44px)}:global(.nes-retro-panel .line) { font-size: 0.75rem; line-height: 1.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis}
</style>


