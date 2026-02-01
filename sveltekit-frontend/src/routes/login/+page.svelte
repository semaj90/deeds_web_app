<script lang="ts">
    import { enhance } from '$app/forms';

    let { form }: { form: { error?: string } | null } = $props();
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
            <div class="rounded-md shadow-sm -space-y-px">
                <div>
                    <label for="username" class="sr-only">Username</label>
                    <input id="username" name="username" type="text" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm rounded-t-md" placeholder="Username">
                </div>
                <div>
                    <label for="password" class="sr-only">Password</label>
                    <input id="password" name="password" type="password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm rounded-b-md" placeholder="Password">
                </div>
            </div>

            <div>
                <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Sign in
                </button>
            </div>
        </form>
    </div>
</div>