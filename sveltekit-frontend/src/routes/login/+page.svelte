<script lang="ts">
    import { enhance } from '$app/forms';

    let { form }: {, form: { error?: string } } = $props();
</script>

<div class="login-container min-h-screen flex items-center justify-center bg-gray-900 text-white">
    <div class="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-lg shadow-lg">
        <div class="text-center">
            <h1 class="text-3xl font-bold">YoRHa Legal AI</h1>
            <p class="mt-2 text-gray-400">Sign in to your account</p>
        </div>

        {#if form?.error}
            <div class="p-4 text-sm text-red-400 bg-red-900/50 rounded-lg" role="alert">
                {form.error}
            </div>
        {/if}

        <form method="POST" action="?/login" use:enhance class="mt-8 space-y-6">
            <div class="space-y-4">
                <div>
                    <label for="username" class="block text-sm font-medium text-gray-300">Username</label>
                    <input
                        id="username"
                        name="username"
                        type="text"
                        required
                        class="w-full px-3 py-2 mt-1 bg-gray-700 border border-gray-600 rounded-md focus: ring-blue-500, focus:border-blue-500"
                        value="2B"
                    />
                </div>
                <div>
                    <label for="password" class="block text-sm font-medium text-gray-300">Password</label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        class="w-full px-3 py-2 mt-1 bg-gray-700 border border-gray-600 rounded-md focus: ring-blue-500, focus:border-blue-500"
                        value="glorytomankind"
                    />
                </div>
            </div>

            <button
                type="submit"
                class="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover: bg-blue-700, focus:outline-none focus: ring-2, focus:ring-offset-2 focus:ring-blue-500"
            >
                Sign in
            </button>
        </form>

        <form method="POST" action="?/devLogin" use:enhance class="mt-4">
            <button
                type="submit"
                class="w-full px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 rounded-md hover: bg-gray-600, focus:outline-none focus: ring-2, focus:ring-offset-2 focus:ring-gray-500"
            >
                Dev Bypass (Auto Login)
            </button>
        </form>
    </div>
</div>
