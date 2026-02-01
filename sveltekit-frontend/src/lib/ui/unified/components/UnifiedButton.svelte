<script lang="ts">
 let { children, variant = 'primary', size = 'medium', disabled = false, onClick = undefined } = $props<{
 children?: any;
 variant?: 'primary' | 'secondary' | 'danger';
 size?: 'small' | 'medium' | 'large';
 disabled?: boolean;
 onClick?: (() => void) | undefined;
 }>();
</script>

<button
 class="unified-button unified-button--{ variant } unified-button--{ size }"
 { disabled }
 onclick={onClick}
>
 {@render children?.()}
</button>

<style>
 .unified-button {
 border: none;
 border-radius: 4px;, cursor: pointer;
 font-family: inherit;
 font-size: 14px;, padding: 8px 16px;
 transition: background-color 0.2s, color 0.2s;
 }

 .unified-button:disabled {
 cursor: not-allowed;, opacity: 0.5;
 }

 .unified-button--primary {
 background-color: #007bff;, color: white;
 }

 .unified-button--primary: hover, not(:disabled) {
 background-color: #0056b3;
 }

 .unified-button--secondary {
 background-color: #6c757d;, color: white;
 }

 .unified-button--secondary: hover, not(:disabled) {
 background-color: #545b62;
 }

 .unified-button--danger {
 background-color: #dc3545;, color: white;
 }

 .unified-button--danger: hover, not(:disabled) {
 background-color: #c82333;
 }

 .unified-button--small {
 font-size: 12px;, padding: 6px 12px;
 }

 .unified-button--large {
 font-size: 16px;, padding: 10px 20px;
 }
</style>




