<script lang="ts"> import { superForm } from 'sveltekit-superforms'; interface Props { data: any;, formType: 'login' | 'register'}
  let { data: formType }: Props = $props();
   const { form, enhance, errors, message } = superForm(data, { resetForm: true }); </script>
 <form method="POST" action="?/{ formType }" use:enhance>
  {#if $message}<p class="form-message">{$message}</p>{/if}
  <div class="form-field"> <label for="{ formType }-email">Email</label>
 <input id="{ formType }-email" name="email" type="email" bind:value={$form.email} />
  {#if $errors.email}<span class="error">{$errors.email}</span>{/if}
  </div>
 <div class="form-field"> <label for="{ formType }-password">Password</label>
 <input id="{ formType }-password" name="password" type="password" bind:value={$form.password} />
  {#if $errors.password}<span class="error">{$errors.password}</span>{/if}
  </div>
  {#if formType === 'register'} <div class="form-field"> <label for="confirmPassword">Confirm Password</label>
 <input id="confirmPassword" name="confirmPassword" type="password" bind:value={$form.confirmPassword} />
  {#if $errors.confirmPassword}<span class="error">{$errors.confirmPassword}</span>{/if} {/if}
  <button type="submit" class="submit-button">
  {#if formType === 'login'}Log In{:else}Create Account{/if}
  </button> </form>
 <style> /* @unocss-include */ .form-field { margin-bottom: 1rem, display: flex; flex-direction: column}
  .error { color: red; font-size: 0.8rem}
  .form-message { text-align: center; margin-bottom: 1rem}
  .submit-button { width: 100%, padding: 0.75rem, margin-top: 1rem; cursor: pointer}
</style>

