<script lang="ts">
	import * as Dialog from "bits-ui/components/dialog";
import { Button, Separator } from 'bits-ui';
let open = $state(false);
	let selectedValue = $state('apple');

	const fruits = [
		{ value: 'apple', label: 'Apple' },
		{ value: 'banana', label: 'Banana' },
		{ value: 'orange', label: 'Orange' }
	];
</script>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
	<div class="max-w-4xl mx-auto">
		<h1 class="text-4xl font-bold text-white mb-4">
			bits-ui + UnoCSS Demo
		</h1>
		<p class="text-gray-300 mb-8">
			Headless UI components with UnoCSS styling for Svelte 5
		</p>

		<!-- Dialog Example -->
		<div class="mb-8">
			<h2 class="text-2xl font-semibold text-white mb-4">Dialog Component</h2>

			<Button.Root
				class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
				onclick={() => open = true}
			>
				Open Dialog
			</Button.Root>

			<Dialog.Root bind:open>
				<Dialog.Portal>
					<Dialog.Overlay class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
					<Dialog.Content
						class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
						       w-full max-w-md p-6 bg-gray-800 rounded-xl shadow-2xl
						       border border-gray-700"
					>
						<Dialog.Title class="text-2xl font-bold text-white mb-2">
							Welcome to bits-ui!
						</Dialog.Title>
						<Dialog.Description class="text-gray-300 mb-6">
							This is a fully accessible dialog built with bits-ui headless components
							and styled with UnoCSS utility classes.
						</Dialog.Description>

						<Separator.Root class="h-px bg-gray-700 my-4" />

						<div class="space-y-3 mb-6">
							<div class="p-3 bg-purple-900/30 rounded-lg border border-purple-700/50">
								<div class="flex items-center gap-2 text-purple-300">
									<div class="i-carbon-checkmark-filled text-xl"></div>
									<span>Svelte 5 Runes Compatible</span>
								</div>
							</div>
							<div class="p-3 bg-purple-900/30 rounded-lg border border-purple-700/50">
								<div class="flex items-center gap-2 text-purple-300">
									<div class="i-carbon-checkmark-filled text-xl"></div>
									<span>Fully Accessible (ARIA)</span>
								</div>
							</div>
							<div class="p-3 bg-purple-900/30 rounded-lg border border-purple-700/50">
								<div class="flex items-center gap-2 text-purple-300">
									<div class="i-carbon-checkmark-filled text-xl"></div>
									<span>UnoCSS Utility Styling</span>
								</div>
							</div>
						</div>

						<div class="flex gap-3">
							<Button.Root
								class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg
								       transition-colors"
								onclick={() => open = false}
							>
								Cancel
							</Button.Root>
							<Button.Root
								class="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg
								       font-medium transition-colors"
								onclick={() => {
									open = false;
									alert('Confirmed!');
								}}
							>
								Confirm
							</Button.Root>
						</div>

						<Dialog.Close
							class="absolute top-4 right-4 p-2 hover:bg-gray-700 rounded-lg transition-colors"
						>
							<div class="i-carbon-close text-xl text-gray-400"></div>
						</Dialog.Close>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</div>

		<!-- Select Example -->
		<div class="mb-8">
			<h2 class="text-2xl font-semibold text-white mb-4">Select Component</h2>

			<div class="max-w-xs">
				<label class="block text-sm font-medium text-gray-300 mb-2">
					Choose a fruit
				</label>
				<div class="relative">
					<button
						class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
						       text-left text-white hover:bg-gray-750 transition-colors
						       flex items-center justify-between"
					>
						<span class="capitalize">{selectedValue}</span>
						<div class="i-carbon-chevron-down text-gray-400"></div>
					</button>
				</div>
			</div>
		</div>

		<!-- Button Examples -->
		<div class="mb-8">
			<h2 class="text-2xl font-semibold text-white mb-4">Button Variants</h2>

			<div class="flex flex-wrap gap-3">
				<Button.Root
					class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg
					       font-medium transition-colors shadow-lg shadow-purple-500/20"
				>
					Primary Button
				</Button.Root>

				<Button.Root
					class="px-6 py-3 bg-transparent border-2 border-purple-600 text-purple-400
					       hover:bg-purple-600/10 rounded-lg font-medium transition-colors"
				>
					Outline Button
				</Button.Root>

				<Button.Root
					class="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg
					       font-medium transition-colors"
				>
					Secondary Button
				</Button.Root>

				<Button.Root
					class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg
					       font-medium transition-colors shadow-lg shadow-red-500/20"
				>
					Danger Button
				</Button.Root>
			</div>
		</div>

		<!-- Separator Examples -->
		<div class="mb-8">
			<h2 class="text-2xl font-semibold text-white mb-4">Separators</h2>

			<div class="space-y-4 p-6 bg-gray-800/50 rounded-lg border border-gray-700">
				<div class="text-gray-300">Section 1</div>
				<Separator.Root class="h-px bg-gray-700" />
				<div class="text-gray-300">Section 2</div>
				<Separator.Root class="h-px bg-purple-600" />
				<div class="text-gray-300">Section 3</div>
			</div>
		</div>

		<!-- UnoCSS Features -->
		<div class="mb-8">
			<h2 class="text-2xl font-semibold text-white mb-4">UnoCSS Features</h2>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="p-6 bg-gray-800/50 rounded-lg border border-gray-700">
					<div class="flex items-center gap-3 mb-3">
						<div class="i-carbon-data-view-alt text-2xl text-purple-400"></div>
						<h3 class="text-lg font-semibold text-white">Utility-First</h3>
					</div>
					<p class="text-gray-400 text-sm">
						Compose designs directly in your markup using utility classes.
					</p>
				</div>

				<div class="p-6 bg-gray-800/50 rounded-lg border border-gray-700">
					<div class="flex items-center gap-3 mb-3">
						<div class="i-carbon-flash text-2xl text-purple-400"></div>
						<h3 class="text-lg font-semibold text-white">Lightning Fast</h3>
					</div>
					<p class="text-gray-400 text-sm">
						On-demand atomic CSS generation with zero runtime.
					</p>
				</div>

				<div class="p-6 bg-gray-800/50 rounded-lg border border-gray-700">
					<div class="flex items-center gap-3 mb-3">
						<div class="i-carbon-code text-2xl text-purple-400"></div>
						<h3 class="text-lg font-semibold text-white">Icon System</h3>
					</div>
					<p class="text-gray-400 text-sm">
						Use icons as classes with the `i-` prefix (Carbon, Lucide, etc.).
					</p>
				</div>

				<div class="p-6 bg-gray-800/50 rounded-lg border border-gray-700">
					<div class="flex items-center gap-3 mb-3">
						<div class="i-carbon-accessibility text-2xl text-purple-400"></div>
						<h3 class="text-lg font-semibold text-white">Accessible</h3>
					</div>
					<p class="text-gray-400 text-sm">
						bits-ui handles ARIA attributes and keyboard navigation automatically.
					</p>
				</div>
			</div>
		</div>

		<!-- Code Example -->
		<div class="mb-8">
			<h2 class="text-2xl font-semibold text-white mb-4">Usage Example</h2>

			<pre class="p-6 bg-gray-900 rounded-lg border border-gray-700 overflow-x-auto text-sm">
				<code class="text-gray-300">{`<script lang="ts">
  import * as Dialog from "bits-ui/components/dialog";
import { Button } from 'bits-ui';
let open = $state(false);
</script>

<Button.Root
  class="px-6 py-3 bg-purple-600 hover:bg-purple-700
         text-white rounded-lg transition-colors"
  onclick={() => open = true}
>
  Open Dialog
</Button.Root>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/50" />
    <Dialog.Content class="fixed left-1/2 top-1/2
                           -translate-x-1/2 -translate-y-1/2
                           bg-gray-800 rounded-xl p-6">
      <Dialog.Title class="text-2xl font-bold text-white">
        Title
      </Dialog.Title>
      <Dialog.Description class="text-gray-300">
        Description
      </Dialog.Description>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>`}</code>
			</pre>
		</div>
	</div>
</div>
