# Dialog Documentation
A modal window for displaying content or requesting user input.
This is a documentation section that potentially contains examples, demos, and other
 useful information related to a specific part of Bits UI. When helping users with this
 documentation, you can ignore the classnames applied to the demos unless they are
 relevant to the user's issue.
Copy Page
### Epicenter
Open source, local first apps
Special Sponsor
New API key
app.svelte
app.css
Expand Code
```
<script lang="ts">
  import { Dialog, Label, Separator } from "bits-ui";
  import LockKeyOpen from "phosphor-svelte/lib/LockKeyOpen";
  import X from "phosphor-svelte/lib/X";
</script>
 
<Dialog.Root>
  <Dialog.Trigger
    class="rounded-input bg-dark text-background
	  shadow-mini hover:bg-dark/95 focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden
	  inline-flex h-12 items-center justify-center whitespace-nowrap px-[21px] text-[15px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
  >
    New API key
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80"
    />
    <Dialog.Content
      class="rounded-card-lg bg-background shadow-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 outline-hidden fixed left-[50%] top-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] border p-5 sm:max-w-[490px] md:w-full"
    >
      <Dialog.Title
        class="flex w-full items-center justify-center text-lg font-semibold tracking-tight"
      >
        Create API key
      </Dialog.Title>
      <Separator.Root class="bg-muted -mx-5 mb-6 mt-5 block h-px" />
      <Dialog.Description class="text-foreground-alt text-sm">
        Create and manage API keys. You can create multiple keys to organize
        your applications.
      </Dialog.Description>
      <div class="flex flex-col items-start gap-1 pb-11 pt-7">
        <Label.Root for="apiKey" class="text-sm font-medium">API Key</Label.Root
        >
        <div class="relative w-full">
          <input
            id="apiKey"
            class="h-input rounded-card-sm border-border-input bg-background placeholder:text-foreground-alt/50 hover:border-dark-40 focus:ring-foreground focus:ring-offset-background focus:outline-hidden inline-flex w-full items-center border px-4 text-base focus:ring-2 focus:ring-offset-2 sm:text-sm"
            placeholder="secret_api_key"
            name="name"
          />
          <LockKeyOpen
            class="text-dark/30 absolute right-4 top-[14px] size-[22px]"
          />
        </div>
      </div>
      <div class="flex w-full justify-end">
        <Dialog.Close
          class="h-input rounded-input bg-dark text-background shadow-mini hover:bg-dark/95 focus-visible:ring-dark focus-visible:ring-offset-background focus-visible:outline-hidden inline-flex items-center justify-center px-[50px] text-[15px] font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Save
        </Dialog.Close>
      </div>
      <Dialog.Close
        class="focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden absolute right-5 top-5 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
      >
        <div>
          <X class="text-foreground size-5" />
          <span class="sr-only">Close</span>
        </div>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```
```
@import url("https://fonts.googleapis.com/css2?family=Source+Code+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");
 
@import "tailwindcss";
@plugin "tailwindcss-animate";
 
@custom-variant dark (&:is(.dark *));
 
@font-face {
	font-family: "Cal Sans";
	font-style: normal;
	font-weight: 600;
	font-display: swap;
	src: url("/CalSans-SemiBold.woff2") format("woff2");
}
 
:root {
	/* Colors */
	--background: hsl(0 0% 100%);
	--background-alt: hsl(0 0% 100%);
	--foreground: hsl(0 0% 9%);
	--foreground-alt: hsl(0 0% 32%);
	--muted: hsl(240 5% 96%);
	--muted-foreground: hsla(0 0% 9% / 0.4);
	--border: hsl(240 6% 10%);
	--border-input: hsla(240 6% 10% / 0.17);
	--border-input-hover: hsla(240 6% 10% / 0.4);
	--border-card: hsla(240 6% 10% / 0.1);
	--dark: hsl(240 6% 10%);
	--dark-10: hsla(240 6% 10% / 0.1);
	--dark-40: hsla(240 6% 10% / 0.4);
	--dark-04: hsla(240 6% 10% / 0.04);
	--accent: hsl(204 94% 94%);
	--accent-foreground: hsl(204 80% 16%);
	--destructive: hsl(347 77% 50%);
	--tertiary: hsl(37.7 92.1% 50.2%);
	--line: hsl(0 0% 100%);
 
	/* black */
	--contrast: hsl(0 0% 0%);
 
	/* Shadows */
	--shadow-mini: 0px 1px 0px 1px rgba(0, 0, 0, 0.04);
	--shadow-mini-inset: 0px 1px 0px 0px rgba(0, 0, 0, 0.04) inset;
	--shadow-popover: 0px 7px 12px 3px hsla(var(--dark-10));
	--shadow-kbd: 0px 2px 0px 0px rgba(0, 0, 0, 0.07);
	--shadow-btn: 0px 1px 0px 1px rgba(0, 0, 0, 0.03);
	--shadow-card: 0px 2px 0px 1px rgba(0, 0, 0, 0.04);
	--shadow-date-field-focus: 0px 0px 0px 3px rgba(24, 24, 27, 0.17);
}
 
.dark {
	/* Colors */
	--background: hsl(0 0% 5%);
	--background-alt: hsl(0 0% 8%);
	--foreground: hsl(0 0% 95%);
	--foreground-alt: hsl(0 0% 70%);
	--muted: hsl(240 4% 16%);
	--muted-foreground: hsla(0 0% 100% / 0.4);
	--border: hsl(0 0% 96%);
	--border-input: hsla(0 0% 96% / 0.17);
	--border-input-hover: hsla(0 0% 96% / 0.4);
	--border-card: hsla(0 0% 96% / 0.1);
	--dark: hsl(0 0% 96%);
	--dark-40: hsl(0 0% 96% / 0.4);
	--dark-10: hsl(0 0% 96% / 0.1);
	--dark-04: hsl(0 0% 96% / 0.04);
	--accent: hsl(204 90% 90%);
	--accent-foreground: hsl(204 94% 94%);
	--destructive: hsl(350 89% 60%);
	--line: hsl(0 0% 9.02%);
	--tertiary: hsl(61.3 100% 82.2%);
	/* white */
	--contrast: hsl(0 0% 100%);
 
	/* Shadows */
	--shadow-mini: 0px 1px 0px 1px rgba(0, 0, 0, 0.3);
	--shadow-mini-inset: 0px 1px 0px 0px rgba(0, 0, 0, 0.5) inset;
	--shadow-popover: 0px 7px 12px 3px hsla(0deg 0% 0% / 30%);
	--shadow-kbd: 0px 2px 0px 0px rgba(255, 255, 255, 0.07);
	--shadow-btn: 0px 1px 0px 1px rgba(0, 0, 0, 0.2);
	--shadow-card: 0px 2px 0px 1px rgba(0, 0, 0, 0.4);
	--shadow-date-field-focus: 0px 0px 0px 3px rgba(244, 244, 245, 0.1);
}
 
@theme inline {
	--color-background: var(--background);
	--color-background-alt: var(--background-alt);
	--color-foreground: var(--foreground);
	--color-foreground-alt: var(--foreground-alt);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-border: var(--border-card);
	--color-border-input: var(--border-input);
	--color-border-input-hover: var(--border-input-hover);
	--color-border-card: var(--border-card);
	--color-dark: var(--dark);
	--color-dark-10: var(--dark-10);
	--color-dark-40: var(--dark-40);
	--color-dark-04: var(--dark-04);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-destructive: var(--destructive);
	--color-tertiary: var(--tertiary);
	--color-line: var(--line);
	--color-contrast: var(--contrast);
 
	--shadow-mini: var(--shadow-mini);
	--shadow-mini-inset: var(--shadow-mini-inset);
	--shadow-popover: var(--shadow-popover);
	--shadow-kbd: var(--shadow-kbd);
	--shadow-btn: var(--shadow-btn);
	--shadow-card: var(--shadow-card);
	--shadow-date-field-focus: var(--shadow-date-field-focus);
 
	--text-xxs: 10px;
 
	--radius-card: 16px;
	--radius-card-lg: 20px;
	--radius-card-sm: 10px;
	--radius-input: 9px;
	--radius-button: 5px;
	--radius-5px: 5px;
	--radius-9px: 9px;
	--radius-10px: 10px;
	--radius-15px: 15px;
 
	--spacing-input: 3rem;
	--spacing-input-sm: 2.5rem;
 
	--breakpoint-desktop: 1440px;
 
	--animate-accordion-down: accordion-down 0.2s ease-out;
	--animate-accordion-up: accordion-up 0.2s ease-out;
	--animate-caret-blink: caret-blink 1s ease-out infinite;
	--animate-scale-in: scale-in 0.2s ease;
	--animate-scale-out: scale-out 0.15s ease;
	--animate-fade-in: fade-in 0.2s ease;
	--animate-fade-out: fade-out 0.15s ease;
	--animate-enter-from-left: enter-from-left 0.2s ease;
	--animate-enter-from-right: enter-from-right 0.2s ease;
	--animate-exit-to-left: exit-to-left 0.2s ease;
	--animate-exit-to-right: exit-to-right 0.2s ease;
 
	--font-sans: "Inter", "sans-serif";
	--font-mono: "Source Code Pro", "monospace";
	--font-alt: "Courier", "sans-serif";
	--font-display: "Cal Sans", "sans-serif";
 
	@keyframes accordion-down {
		from {
			height: 0;
		}
		to {
			height: var(--bits-accordion-content-height);
		}
	}
 
	@keyframes accordion-up {
		from {
			height: var(--bits-accordion-content-height);
		}
		to {
			height: 0;
		}
	}
 
	@keyframes caret-blink {
		0%,
		70%,
		100% {
			opacity: 1;
		}
		20%,
		50% {
			opacity: 0;
		}
	}
 
	@keyframes enter-from-right {
		from {
			opacity: 0;
			transform: translateX(200px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
 
	@keyframes enter-from-left {
		from {
			opacity: 0;
			transform: translateX(-200px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
 
	@keyframes exit-to-right {
		from {
			opacity: 1;
			transform: translateX(0);
		}
		to {
			opacity: 0;
			transform: translateX(200px);
		}
	}
 
	@keyframes exit-to-left {
		from {
			opacity: 1;
			transform: translateX(0);
		}
		to {
			opacity: 0;
			transform: translateX(-200px);
		}
	}
 
	@keyframes scale-in {
		from {
			opacity: 0;
			transform: rotateX(-10deg) scale(0.9);
		}
		to {
			opacity: 1;
			transform: rotateX(0deg) scale(1);
		}
	}
 
	@keyframes scale-out {
		from {
			opacity: 1;
			transform: rotateX(0deg) scale(1);
		}
		to {
			opacity: 0;
			transform: rotateX(-10deg) scale(0.95);
		}
	}
 
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
 
	@keyframes fade-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
}
 
@layer base {
	*,
	::after,
	::before,
	::backdrop,
	::file-selector-button {
		border-color: var(--color-border-card, currentColor);
	}
 
	* {
		@apply border-border;
	}
	html {
		-webkit-text-size-adjust: 100%;
		font-variation-settings: normal;
		scrollbar-color: var(--bg-muted);
	}
 
	body {
		@apply bg-background text-foreground;
		font-feature-settings:
			"rlig" 1,
			"calt" 1;
	}
 
	::selection {
		background: #fdffa4;
		color: black;
	}
}
 
@layer components {
	*:not(body):not(.focus-override) {
		outline: none !important;
		&:focus-visible {
			@apply focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1;
		}
	}
 
	.link {
		@apply hover:text-foreground/80 focus-visible:ring-foreground focus-visible:ring-offset-background rounded-xs focus-visible:outline-hidden inline-flex items-center gap-1 font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-offset-2;
	}
}
```
## Overview
The Dialog component in Bits UI provides a flexible and accessible way to create modal dialogs in your Svelte applications. It follows a compound component pattern, allowing for fine-grained control over the dialog's structure and behavior while maintaining accessibility and ease of use.
## Key Features
Compound Component Structure
: Offers a set of sub-components that work together to create a fully-featured dialog.
Accessibility
: Built with WAI-ARIA guidelines in mind, ensuring keyboard navigation and screen reader support.
Customizable
: Each sub-component can be styled and configured independently.
Portal Support
: Content can be rendered in a portal, ensuring proper stacking context.
Managed Focus
: Automatically manages focus, with the option to take control if needed.
Flexible State Management
: Supports both controlled and uncontrolled state, allowing for full control over the dialog's open state.
## Architecture
The Dialog component is composed of several sub-components, each with a specific role:
Root
: The main container component that manages the state of the dialog. Provides context for all child components.
Trigger
: A button that toggles the dialog's open state.
Portal
: Renders its children in a portal, outside the normal DOM hierarchy.
Overlay
: A backdrop that sits behind the dialog content.
Content
: The main container for the dialog's content.
Title
: Renders the dialog's title.
Description
: Renders a description or additional context for the dialog.
Close
: A button that closes the dialog.
## Structure
Here's an overview of how the Dialog component is structured in code:
```
<script lang="ts">
  import { Dialog } from "bits-ui";
</script>
 
<Dialog.Root>
  <Dialog.Trigger />
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title />
      <Dialog.Description />
      <Dialog.Close />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```
## Reusable Components
Bits UI provides a comprehensive set of Dialog components that serve as building blocks for creating customized, reusable Dialog implementations. This approach offers flexibility in design while maintaining consistency and accessibility across your application.
### Building a Reusable Dialog
The following example demonstrates how to create a versatile, reusable Dialog component using Bits UI building blocks. This implementation showcases the flexibility of the component API by combining props and snippets.
MyDialog.svelte
```
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog, type WithoutChild } from "bits-ui";
 
  type Props = Dialog.RootProps & {
    buttonText: string;
    title: Snippet;
    description: Snippet;
    contentProps?: WithoutChild<Dialog.ContentProps>;
    // ...other component props if you wish to pass them
  };
 
  let {
    open = $bindable(false),
    children,
    buttonText,
    contentProps,
    title,
    description,
    ...restProps
  }: Props = $props();
</script>
 
<Dialog.Root bind:open {...restProps}>
  <Dialog.Trigger>
    {buttonText}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content {...contentProps}>
      <Dialog.Title>
        {@render title()}
      </Dialog.Title>
      <Dialog.Description>
        {@render description()}
      </Dialog.Description>
      {@render children?.()}
      <Dialog.Close>Close Dialog</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```
#### Usage with Inline Snippets
```
<script lang="ts">
  import MyDialog from "$lib/components/MyDialog.svelte";
</script>
 
<MyDialog buttonText="Open Dialog">
  {#snippet title()}
    Account settings
  {/snippet}
 
  {#snippet description()}
    Manage your account settings and preferences.
  {/snippet}
 
  <!-- Additional dialog content here... -->
</MyDialog>
```
#### Usage with Separate Snippets
```
<script lang="ts">
  import MyDialog from "$lib/components/MyDialog.svelte";
</script>
 
{#snippet title()}
  Account settings
{/snippet}
 
{#snippet description()}
  Manage your account settings and preferences.
{/snippet}
 
<MyDialog buttonText="Open Dialog" {title} {description}>
  <!-- Additional dialog content here... -->
</MyDialog>
```
### Best Practices
Prop Flexibility
: Design your component to accept props for any nested components for maximum flexibility
Styling Options
: Use tools like
`clsx`
to merge class overrides
Binding Props
: Use
`bind:`
and expose
`$bindable`
props to provide consumers with full control
Type Safety
: Use the exported types from Bits UI to type your component props
## Managing Open State
This section covers how to manage the
`open`
state of the component.
### Two-Way Binding
Use
`bind:open`
for simple, automatic state synchronization:
```
<script lang="ts">
  import { Dialog } from "bits-ui";
  let isOpen = $state(false);
</script>
 
<button onclick={() => (isOpen = true)}>Open Dialog</button>
 
<Dialog.Root bind:open={isOpen}>
  <!-- ... -->
</Dialog.Root>
```
### Fully Controlled
Use a
Function Binding
for complete control over the state's reads and writes.
```
<script lang="ts">
  import { Dialog } from "bits-ui";
  let myOpen = $state(false);
 
  function getOpen() {
    return myOpen;
  }
 
  function setOpen(newOpen: boolean) {
    myOpen = newOpen;
  }
</script>
 
<Dialog.Root bind:open={getOpen, setOpen}>
  <!-- ... -->
</Dialog.Root>
```
## Focus Management
Proper focus management is crucial for accessibility and user experience in modal dialogs. Bits UI's Dialog component provides several features to help you manage focus effectively.
### Focus Trap
By default, the Dialog implements a focus trap, adhering to the WAI-ARIA design pattern for modal dialogs. This ensures that keyboard focus remains within the Dialog while it's open, preventing users from interacting with the rest of the page.
#### Disabling the Focus Trap
While not recommended, you can disable the focus trap if absolutely necessary:
```
<Dialog.Content trapFocus={false}>
  <!-- ... -->
</Dialog.Content>
```
##### Accessibility Warning
Disabling the focus trap may compromise accessibility. Only do this if you have a specific reason and implement an alternative focus management strategy.
### Open Focus
When a Dialog opens, focus is automatically set to the first focusable element within
`Dialog.Content`
. This ensures keyboard users can immediately interact with the Dialog contents.
#### Customizing Initial Focus
To specify which element receives focus when the Dialog opens, use the
`onOpenAutoFocus`
prop on
`Dialog.Content`
:
```
<script lang="ts">
  import { Dialog } from "bits-ui";
  let nameInput = $state<HTMLInputElement>();
</script>
 
<Dialog.Root>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>
  <Dialog.Content
    onOpenAutoFocus={(e) => {
      e.preventDefault();
      nameInput?.focus();
    }}
  >
    <input type="text" bind:this={nameInput} />
  </Dialog.Content>
</Dialog.Root>
```
##### Important
Always ensure that
something
within the Dialog receives focus when it opens. This is crucial for maintaining keyboard navigation context and makes your users happy.
### Close Focus
When a Dialog closes, focus returns to the element that triggered its opening (typically the
`Dialog.Trigger`
).
#### Customizing Close Focus
To change which element receives focus when the Dialog closes, use the
`onCloseAutoFocus`
prop on
`Dialog.Content`
:
```
<script lang="ts">
  import { Dialog } from "bits-ui";
  let nameInput = $state<HTMLInputElement>();
</script>
 
<input type="text" bind:this={nameInput} />
<Dialog.Root>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>
  <Dialog.Content
    onCloseAutoFocus={(e) => {
      e.preventDefault();
      nameInput?.focus();
    }}
  >
    <!-- ... -->
  </Dialog.Content>
</Dialog.Root>
```
### Best Practices
Always maintain a clear focus management strategy for your Dialogs.
Ensure that focus is predictable and logical for keyboard users.
Test your focus management with keyboard navigation to verify its effectiveness.
## Advanced Behaviors
Bits UI's Dialog component offers several advanced features to customize its behavior and enhance user experience. This section covers scroll locking, escape key handling, and interaction outside the dialog.
### Scroll Lock
By default, when a Dialog opens, scrolling the body is disabled. This provides a more native-like experience, focusing user attention on the dialog content.
#### Customizing Scroll Behavior
To allow body scrolling while the dialog is open, use the
`preventScroll`
prop on
`Dialog.Content`
:
```
<Dialog.Content preventScroll={false}>
  <!-- ... -->
</Dialog.Content>
```
##### Note
Enabling body scroll may affect user focus and accessibility. Use this option judiciously.
### Escape Key Handling
By default, pressing the
`Escape`
key closes an open Dialog. Bits UI provides two methods to customize this behavior.
#### Method 1: escapeKeydownBehavior
The
`escapeKeydownBehavior`
prop allows you to customize the behavior taken by the component when the
`Escape`
key is pressed. It accepts one of the following values:
`'close'`
(default): Closes the Dialog immediately.
`'ignore'`
: Prevents the Dialog from closing.
`'defer-otherwise-close'`
: If an ancestor Bits UI component also implements this prop, it will defer the closing decision to that component. Otherwise, the Dialog will close immediately.
`'defer-otherwise-ignore'`
: If an ancestor Bits UI component also implements this prop, it will defer the closing decision to that component. Otherwise, the Dialog will ignore the key press and not close.
To always prevent the Dialog from closing on Escape key press, set the
`escapeKeydownBehavior`
prop to
`'ignore'`
on
`Dialog.Content`
:
```
<Dialog.Content escapeKeydownBehavior="ignore">
  <!-- ... -->
</Dialog.Content>
```
#### Method 2: onEscapeKeydown
For more granular control, override the default behavior using the
`onEscapeKeydown`
prop:
```
<Dialog.Content
  onEscapeKeydown={(e) => {
    e.preventDefault();
    // do something else instead
  }}
>
  <!-- ... -->
</Dialog.Content>
```
This method allows you to implement custom logic when the
`Escape`
key is pressed.
### Interaction Outside
By default, interacting outside the Dialog content area closes the Dialog. Bits UI offers two ways to modify this behavior.
#### Method 1: interactOutsideBehavior
The
`interactOutsideBehavior`
prop allows you to customize the behavior taken by the component when an interaction (touch, mouse, or pointer event) occurs outside the content. It accepts one of the following values:
`'close'`
(default): Closes the Dialog immediately.
`'ignore'`
: Prevents the Dialog from closing.
`'defer-otherwise-close'`
: If an ancestor Bits UI component also implements this prop, it will defer the closing decision to that component. Otherwise, the Dialog will close immediately.
`'defer-otherwise-ignore'`
: If an ancestor Bits UI component also implements this prop, it will defer the closing decision to that component. Otherwise, the Dialog will ignore the event and not close.
To always prevent the Dialog from closing when an interaction occurs outside the content, set the
`interactOutsideBehavior`
prop to
`'ignore'`
on
`Dialog.Content`
:
```
<Dialog.Content interactOutsideBehavior="ignore">
  <!-- ... -->
</Dialog.Content>
```
#### Method 2: onInteractOutside
For custom handling of outside interactions, you can override the default behavior using the
`onInteractOutside`
prop:
```
<Dialog.Content
  onInteractOutside={(e) => {
    e.preventDefault();
    // do something else instead
  }}
>
  <!-- ... -->
</Dialog.Content>
```
This approach allows you to implement specific behaviors when users interact outside the Dialog content.
### Best Practices
Scroll Lock
: Consider your use case carefully before disabling scroll lock. It may be necessary for dialogs with scrollable content or for specific UX requirements.
Escape Keydown
: Overriding the default escape key behavior should be done thoughtfully. Users often expect the escape key to close modals.
Outside Interactions
: Ignoring outside interactions can be useful for important dialogs or multi-step processes, but be cautious not to trap users unintentionally.
Accessibility
: Always ensure that any customizations maintain or enhance the dialog's accessibility.
User Expectations
: Try to balance custom behaviors with common UX patterns to avoid confusing users.
By leveraging these advanced features, you can create highly customized dialog experiences while maintaining usability and accessibility standards.
## Nested Dialogs
Dialogs can be nested within each other to create more complex user interfaces:
Open First Dialog
Expand Code
```
<script lang="ts">
  import X from "phosphor-svelte/lib/X";
  import { Dialog } from "bits-ui";
 
  let rootOpen = $state(false);
  let nestedOpen = $state(false);
</script>
 
<Dialog.Root bind:open={rootOpen}>
  <Dialog.Trigger
    class="rounded-input bg-dark text-background
	shadow-mini hover:bg-dark/95 focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden
	inline-flex h-12 select-none items-center justify-center whitespace-nowrap px-[21px] text-[15px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
  >
    Open First Dialog
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-nested:hidden fixed inset-0 z-50 bg-black/80 transition-opacity duration-200"
    />
    <Dialog.Content
      class="rounded-card-lg bg-background shadow-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 outline-hidden fixed left-[50%] top-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[calc(-50%+var(--bits-dialog-nested-count)*-1.5rem)] scale-[calc(1-var(--bits-dialog-nested-count)*0.05)] border p-6 transition-all duration-200 sm:max-w-[500px] md:w-full"
      style="filter: blur(calc(var(--bits-dialog-nested-count) * 1px));"
    >
      <Dialog.Title class="mb-2 text-lg font-semibold tracking-tight">
        First Dialog
      </Dialog.Title>
      <Dialog.Description class="text-foreground-alt mb-6 text-sm">
        This is the first dialog in the nested dialog stack.
      </Dialog.Description>
      <Dialog.Root bind:open={nestedOpen}>
        <Dialog.Trigger
          class="rounded-input bg-dark text-background
				shadow-mini hover:bg-dark/95 focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden
				inline-flex h-12 select-none items-center justify-center whitespace-nowrap px-[21px] text-[15px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Open Second Dialog
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-nested:hidden fixed inset-0 z-50 bg-black/80 transition-opacity duration-200"
          />
          <Dialog.Content
            class="rounded-card-lg bg-background shadow-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 outline-hidden fixed left-[50%] top-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[calc(-50%+var(--bits-dialog-nested-count)*-1rem)] scale-[calc(1-var(--bits-dialog-nested-count)*0.05)] border p-6 transition-all duration-200 sm:max-w-[500px] md:w-full"
            style="filter: blur(calc(var(--bits-dialog-nested-count) * 1.5px));"
          >
            <Dialog.Title class="mb-2 text-lg font-semibold tracking-tight">
              Second Dialog
            </Dialog.Title>
            <Dialog.Description class="text-foreground-alt mb-6 text-sm">
              This is the second dialog in the nested dialog stack.
            </Dialog.Description>
            <Dialog.Close
              class="rounded-input bg-dark text-background
	shadow-mini hover:bg-dark/95 focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden
	inline-flex h-12 select-none items-center justify-center whitespace-nowrap px-[21px] text-[15px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Close Second Dialog
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Close
        class="focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden absolute right-5 top-5 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
      >
        <div>
          <X class="text-foreground size-5" />
          <span class="sr-only">Close</span>
        </div>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```
```
@import url("https://fonts.googleapis.com/css2?family=Source+Code+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");
 
@import "tailwindcss";
@plugin "tailwindcss-animate";
 
@custom-variant dark (&:is(.dark *));
 
@font-face {
	font-family: "Cal Sans";
	font-style: normal;
	font-weight: 600;
	font-display: swap;
	src: url("/CalSans-SemiBold.woff2") format("woff2");
}
 
:root {
	/* Colors */
	--background: hsl(0 0% 100%);
	--background-alt: hsl(0 0% 100%);
	--foreground: hsl(0 0% 9%);
	--foreground-alt: hsl(0 0% 32%);
	--muted: hsl(240 5% 96%);
	--muted-foreground: hsla(0 0% 9% / 0.4);
	--border: hsl(240 6% 10%);
	--border-input: hsla(240 6% 10% / 0.17);
	--border-input-hover: hsla(240 6% 10% / 0.4);
	--border-card: hsla(240 6% 10% / 0.1);
	--dark: hsl(240 6% 10%);
	--dark-10: hsla(240 6% 10% / 0.1);
	--dark-40: hsla(240 6% 10% / 0.4);
	--dark-04: hsla(240 6% 10% / 0.04);
	--accent: hsl(204 94% 94%);
	--accent-foreground: hsl(204 80% 16%);
	--destructive: hsl(347 77% 50%);
	--tertiary: hsl(37.7 92.1% 50.2%);
	--line: hsl(0 0% 100%);
 
	/* black */
	--contrast: hsl(0 0% 0%);
 
	/* Shadows */
	--shadow-mini: 0px 1px 0px 1px rgba(0, 0, 0, 0.04);
	--shadow-mini-inset: 0px 1px 0px 0px rgba(0, 0, 0, 0.04) inset;
	--shadow-popover: 0px 7px 12px 3px hsla(var(--dark-10));
	--shadow-kbd: 0px 2px 0px 0px rgba(0, 0, 0, 0.07);
	--shadow-btn: 0px 1px 0px 1px rgba(0, 0, 0, 0.03);
	--shadow-card: 0px 2px 0px 1px rgba(0, 0, 0, 0.04);
	--shadow-date-field-focus: 0px 0px 0px 3px rgba(24, 24, 27, 0.17);
}
 
.dark {
	/* Colors */
	--background: hsl(0 0% 5%);
	--background-alt: hsl(0 0% 8%);
	--foreground: hsl(0 0% 95%);
	--foreground-alt: hsl(0 0% 70%);
	--muted: hsl(240 4% 16%);
	--muted-foreground: hsla(0 0% 100% / 0.4);
	--border: hsl(0 0% 96%);
	--border-input: hsla(0 0% 96% / 0.17);
	--border-input-hover: hsla(0 0% 96% / 0.4);
	--border-card: hsla(0 0% 96% / 0.1);
	--dark: hsl(0 0% 96%);
	--dark-40: hsl(0 0% 96% / 0.4);
	--dark-10: hsl(0 0% 96% / 0.1);
	--dark-04: hsl(0 0% 96% / 0.04);
	--accent: hsl(204 90% 90%);
	--accent-foreground: hsl(204 94% 94%);
	--destructive: hsl(350 89% 60%);
	--line: hsl(0 0% 9.02%);
	--tertiary: hsl(61.3 100% 82.2%);
	/* white */
	--contrast: hsl(0 0% 100%);
 
	/* Shadows */
	--shadow-mini: 0px 1px 0px 1px rgba(0, 0, 0, 0.3);
	--shadow-mini-inset: 0px 1px 0px 0px rgba(0, 0, 0, 0.5) inset;
	--shadow-popover: 0px 7px 12px 3px hsla(0deg 0% 0% / 30%);
	--shadow-kbd: 0px 2px 0px 0px rgba(255, 255, 255, 0.07);
	--shadow-btn: 0px 1px 0px 1px rgba(0, 0, 0, 0.2);
	--shadow-card: 0px 2px 0px 1px rgba(0, 0, 0, 0.4);
	--shadow-date-field-focus: 0px 0px 0px 3px rgba(244, 244, 245, 0.1);
}
 
@theme inline {
	--color-background: var(--background);
	--color-background-alt: var(--background-alt);
	--color-foreground: var(--foreground);
	--color-foreground-alt: var(--foreground-alt);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-border: var(--border-card);
	--color-border-input: var(--border-input);
	--color-border-input-hover: var(--border-input-hover);
	--color-border-card: var(--border-card);
	--color-dark: var(--dark);
	--color-dark-10: var(--dark-10);
	--color-dark-40: var(--dark-40);
	--color-dark-04: var(--dark-04);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-destructive: var(--destructive);
	--color-tertiary: var(--tertiary);
	--color-line: var(--line);
	--color-contrast: var(--contrast);
 
	--shadow-mini: var(--shadow-mini);
	--shadow-mini-inset: var(--shadow-mini-inset);
	--shadow-popover: var(--shadow-popover);
	--shadow-kbd: var(--shadow-kbd);
	--shadow-btn: var(--shadow-btn);
	--shadow-card: var(--shadow-card);
	--shadow-date-field-focus: var(--shadow-date-field-focus);
 
	--text-xxs: 10px;
 
	--radius-card: 16px;
	--radius-card-lg: 20px;
	--radius-card-sm: 10px;
	--radius-input: 9px;
	--radius-button: 5px;
	--radius-5px: 5px;
	--radius-9px: 9px;
	--radius-10px: 10px;
	--radius-15px: 15px;
 
	--spacing-input: 3rem;
	--spacing-input-sm: 2.5rem;
 
	--breakpoint-desktop: 1440px;
 
	--animate-accordion-down: accordion-down 0.2s ease-out;
	--animate-accordion-up: accordion-up 0.2s ease-out;
	--animate-caret-blink: caret-blink 1s ease-out infinite;
	--animate-scale-in: scale-in 0.2s ease;
	--animate-scale-out: scale-out 0.15s ease;
	--animate-fade-in: fade-in 0.2s ease;
	--animate-fade-out: fade-out 0.15s ease;
	--animate-enter-from-left: enter-from-left 0.2s ease;
	--animate-enter-from-right: enter-from-right 0.2s ease;
	--animate-exit-to-left: exit-to-left 0.2s ease;
	--animate-exit-to-right: exit-to-right 0.2s ease;
 
	--font-sans: "Inter", "sans-serif";
	--font-mono: "Source Code Pro", "monospace";
	--font-alt: "Courier", "sans-serif";
	--font-display: "Cal Sans", "sans-serif";
 
	@keyframes accordion-down {
		from {
			height: 0;
		}
		to {
			height: var(--bits-accordion-content-height);
		}
	}
 
	@keyframes accordion-up {
		from {
			height: var(--bits-accordion-content-height);
		}
		to {
			height: 0;
		}
	}
 
	@keyframes caret-blink {
		0%,
		70%,
		100% {
			opacity: 1;
		}
		20%,
		50% {
			opacity: 0;
		}
	}
 
	@keyframes enter-from-right {
		from {
			opacity: 0;
			transform: translateX(200px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
 
	@keyframes enter-from-left {
		from {
			opacity: 0;
			transform: translateX(-200px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
 
	@keyframes exit-to-right {
		from {
			opacity: 1;
			transform: translateX(0);
		}
		to {
			opacity: 0;
			transform: translateX(200px);
		}
	}
 
	@keyframes exit-to-left {
		from {
			opacity: 1;
			transform: translateX(0);
		}
		to {
			opacity: 0;
			transform: translateX(-200px);
		}
	}
 
	@keyframes scale-in {
		from {
			opacity: 0;
			transform: rotateX(-10deg) scale(0.9);
		}
		to {
			opacity: 1;
			transform: rotateX(0deg) scale(1);
		}
	}
 
	@keyframes scale-out {
		from {
			opacity: 1;
			transform: rotateX(0deg) scale(1);
		}
		to {
			opacity: 0;
			transform: rotateX(-10deg) scale(0.95);
		}
	}
 
	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
 
	@keyframes fade-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}
}
 
@layer base {
	*,
	::after,
	::before,
	::backdrop,
	::file-selector-button {
		border-color: var(--color-border-card, currentColor);
	}
 
	* {
		@apply border-border;
	}
	html {
		-webkit-text-size-adjust: 100%;
		font-variation-settings: normal;
		scrollbar-color: var(--bg-muted);
	}
 
	body {
		@apply bg-background text-foreground;
		font-feature-settings:
			"rlig" 1,
			"calt" 1;
	}
 
	::selection {
		background: #fdffa4;
		color: black;
	}
}
 
@layer components {
	*:not(body):not(.focus-override) {
		outline: none !important;
		&:focus-visible {
			@apply focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1;
		}
	}
 
	.link {
		@apply hover:text-foreground/80 focus-visible:ring-foreground focus-visible:ring-offset-background rounded-xs focus-visible:outline-hidden inline-flex items-center gap-1 font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-offset-2;
	}
}
```
### Styling Nested Dialogs
The Dialog component automatically tracks nesting information that can be used to create visual hierarchy when dialogs are nested. This is particularly useful for creating effects like scaling down or dimming parent dialogs when child dialogs open.
#### Available Styling Hooks
Each dialog provides the following data attributes and CSS variables:
Data Attributes:
`data-nested-open`
: Present on
`Dialog.Content`
and
`Dialog.Overlay`
when one or more nested dialogs are open within this dialog.
`data-nested`
: Present on
`Dialog.Content`
and
`Dialog.Overlay`
when the dialog is a nested dialog, useful for hiding the overlay of nested dialogs to avoid overlapping with parent dialogs.
CSS Variables:
`--bits-dialog-depth`
: The nesting depth of the dialog (0 for root, 1 for first nested, etc.).
`--bits-dialog-nested-count`
: The number of currently open nested dialogs within this dialog (updates reactively).
#### Example: Scale Down Parent Dialogs
```
<Dialog.Root>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content
      style="transform: scale(calc(1 - var(--bits-dialog-nested-count) * 0.05));
             filter: blur(calc(var(--bits-dialog-nested-count) * 2px));"
    >
      <!-- Dialog content -->
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```
These styling hooks allow you to create sophisticated visual feedback that helps users understand the hierarchy of nested dialogs.
## Svelte Transitions
The Dialog component can be enhanced with Svelte's built-in transition effects or other animation libraries.
### Using forceMount and child Snippets
To apply Svelte transitions to Dialog components, use the
`forceMount`
prop in combination with the
`child`
snippet. This approach gives you full control over the mounting behavior and animation of
`Dialog.Content`
and
`Dialog.Overlay`
.
```
<script lang="ts">
  import { Dialog } from "bits-ui";
  import { fly, fade } from "svelte/transition";
</script>
 
<Dialog.Root>
  <!-- ... other dialog components -->
  <Dialog.Overlay forceMount>
    {#snippet child({ props, open })}
      {#if open}
        <div {...props} transition:fade>
          <!-- ... -->
        </div>
      {/if}
    {/snippet}
  </Dialog.Overlay>
  <Dialog.Content forceMount>
    {#snippet child({ props, open })}
      {#if open}
        <div {...props} transition:fly>
          <!-- ... -->
        </div>
      {/if}
    {/snippet}
  </Dialog.Content>
</Dialog.Root>
```
In this example:
The
`forceMount`
prop ensures the components are always in the DOM.
The
`child`
snippet provides access to the open state and component props.
Svelte's
`#if`
block controls when the content is visible.
Transition directives (
`transition:fade`
and
`transition:fly`
) apply the animations.
### Best Practices
For cleaner code and better maintainability, consider creating custom reusable components that encapsulate this transition logic.
MyDialogOverlay.svelte
```
<script lang="ts">
  import { Dialog, type WithoutChildrenOrChild } from "bits-ui";
  import { fade } from "svelte/transition";
  import type { Snippet } from "svelte";
 
  let {
    ref = $bindable(null),
    duration = 200,
    children,
    ...restProps
  }: WithoutChildrenOrChild<Dialog.OverlayProps> & {
    duration?: number;
    children?: Snippet;
  } = $props();
</script>
 
<Dialog.Overlay forceMount bind:ref {...restProps}>
  {#snippet child({ props, open })}
    {#if open}
      <div {...props} transition:fade={{ duration }}>
        {@render children?.()}
      </div>
    {/if}
  {/snippet}
</Dialog.Overlay>
```
You can then use the
`MyDialogOverlay`
component alongside the other
`Dialog`
primitives throughout your application:
```
<script lang="ts">
  import { Dialog } from "bits-ui";
  import { MyDialogOverlay } from "$lib/components";
</script>
 
<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <MyDialogOverlay duration={300} />
    <Dialog.Content>
      <!-- ... -->
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```
## Working with Forms
### Form Submission
When using the
`Dialog`
component, often you'll want to submit a form or perform an asynchronous action and then close the dialog.
This can be done by waiting for the asynchronous action to complete, then programmatically closing the dialog.
```
<script lang="ts">
	import { Dialog } from "bits-ui";
 
	function wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
 
	let open = $state(false);
</script>
 
<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay />
		<Dialog.Content>
			<Dialog.Title>Confirm your action</Dialog.Title>
			<Dialog.Description>Are you sure you want to do this?</Dialog.Description>
			<form
				method="POST"
				action="?/someAction"
				onsubmit={() => {
					wait(1000).then(() => (open = false));
				}}
			>
				<button type="submit">Submit form</Dialog.Action>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
```
### Inside a Form
If you're using a
`Dialog`
within
a form, you'll need to ensure that the
`Portal`
is disabled or not included in the
`Dialog`
structure. This is because the
`Portal`
will render the dialog content
outside
of the form, which will prevent the form from being submitted correctly.
## API Reference
### Dialog. Root
The root component used to set and manage the state of the dialog.
Property | Type | Description | Details
open $bindable | boolean | Whether or not the dialog is open. Default: false | See type definition
onOpenChange | function See type definition - (open: boolean) =&gt; void | A callback function called when the open state changes. Default: —— undefined | See type definition
onOpenChangeComplete | function See type definition - (open: boolean) =&gt; void | A callback function called after the open state changes and all animations have completed. Default: —— undefined | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
### Dialog. Trigger
The element which opens the dialog on press.
Property | Type | Description | Details
ref $bindable | HTMLButtonElement | The underlying DOM element being rendered. You can bind to this to get a reference to the element. Default: null | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
child | Snippet See type definition - type SnippetProps = &#123;
 props: Record&lt;string, unknown&gt;;
&#125;; | Use render delegation to render your own element. See Child Snippet docs for more information. Default: —— undefined | See type definition
Data Attribute | Value | Description | Details
data-dialog-trigger | '' | Present on the trigger. | See type definition
### Dialog. Portal
A portal which renders the dialog into the body when it is open.
Property | Type | Description | Details
to | union See type definition - Element | string | Where to render the content when it is open. Defaults to the body. Default: document.body | See type definition
disabled | boolean | Whether the portal is disabled or not. When disabled, the content will be rendered in its original DOM location. Default: false | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
### Dialog. Content
The content displayed within the dialog modal.
Property | Type | Description | Details
onEscapeKeydown | function See type definition - (event: KeyboardEvent) =&gt; void | Callback fired when an escape keydown event occurs in the floating content. You can call event.preventDefault() to prevent the default behavior of handling the escape keydown event. Default: —— undefined | See type definition
escapeKeydownBehavior | enum See type definition - 'close' | 'ignore' | 'defer-otherwise-close' | 'defer-otherwise-ignore' | The behavior to use when an escape keydown event occurs in the floating content. 'close' will close the content immediately. 'ignore' will prevent the content from closing. 'defer-otherwise-close' will defer to the parent element if it exists, otherwise it will close the content. 'defer-otherwise-ignore' will defer to the parent element if it exists, otherwise it will ignore the interaction. Default: 'close' | See type definition
onInteractOutside | function See type definition - (event: PointerEvent) =&gt; void | Callback fired when an outside interaction event occurs, which is a pointerdown event. You can call event.preventDefault() to prevent the default behavior of handling the outside interaction. Default: —— undefined | See type definition
onFocusOutside | function See type definition - (event: FocusEvent) =&gt; void | Callback fired when focus leaves the dismissible layer. You can call event.preventDefault() to prevent the default behavior on focus leaving the layer. Default: —— undefined | See type definition
interactOutsideBehavior | enum See type definition - 'close' | 'ignore' | 'defer-otherwise-close' | 'defer-otherwise-ignore' | The behavior to use when an interaction occurs outside of the floating content. 'close' will close the content immediately. 'ignore' will prevent the content from closing. 'defer-otherwise-close' will defer to the parent element if it exists, otherwise it will close the content. 'defer-otherwise-ignore' will defer to the parent element if it exists, otherwise it will ignore the interaction. Default: 'close' | See type definition
onOpenAutoFocus | function See type definition - (event: Event) =&gt; void | Event handler called when auto-focusing the content as it is opened. Can be prevented. Default: —— undefined | See type definition
onCloseAutoFocus | function See type definition - (event: Event) =&gt; void | Event handler called when auto-focusing the content as it is closed. Can be prevented. Default: —— undefined | See type definition
trapFocus | boolean | Whether or not to trap the focus within the content when open. Default: true | See type definition
forceMount | boolean | Whether or not to forcefully mount the content. This is useful if you want to use Svelte transitions or another animation library for the content. Default: false | See type definition
preventOverflowTextSelection | boolean | When true , prevents the text selection from overflowing the bounds of the element. Default: true | See type definition
preventScroll | boolean | When true , prevents the body from scrolling when the content is open. This is useful when you want to use the content as a modal. Default: true | See type definition
restoreScrollDelay | number | The delay in milliseconds before the scrollbar is restored after closing the dialog. This is only applicable when using the child snippet for custom transitions and preventScroll and forceMount are true . You should set this to a value greater than the transition duration to prevent content from shifting during the transition. Default: 0 | See type definition
ref $bindable | HTMLDivElement | The underlying DOM element being rendered. You can bind to this to get a reference to the element. Default: null | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
child | Snippet See type definition - type ChildSnippetProps = &#123;
 open: boolean;
 props: Record&lt;string, unknown&gt;;
&#125;; | Use render delegation to render your own element. See Child Snippet docs for more information. Default: —— undefined | See type definition
Data Attribute | Value | Description | Details
data-state | enum See enum options - 'open' | 'closed' | The state of the dialog. | See type definition
data-starting-style | '' | Present during the initial open frame. Use this to define the starting styles for CSS transitions. | See type definition
data-ending-style | '' | Present while closing before unmount. Use this to define the ending styles for CSS transitions. | See type definition
data-dialog-content | '' | Present on the content. | See type definition
data-nested-open | '' | Present when one or more nested dialogs are open within this dialog. Can be used to style parent dialogs differently when children are open. | See type definition
data-nested | '' | Present when the dialog is a nested dialog, useful for hiding the overlay of nested dialogs to avoid overlapping with the root dialog's overlay. | See type definition
CSS Variable | Description | Details
--bits-dialog-depth | The nesting depth of the dialog (0 for root dialogs, 1 for first nested, etc.). | CSS Variable details
--bits-dialog-nested-count | The number of currently open nested dialogs within this dialog. Updates reactively as nested dialogs open and close. | CSS Variable details
### Dialog. Overlay
An overlay which covers the body when the dialog is open.
Property | Type | Description | Details
forceMount | boolean | Whether or not to forcefully mount the content. This is useful if you want to use Svelte transitions or another animation library for the content. Default: false | See type definition
ref $bindable | HTMLDivElement | The underlying DOM element being rendered. You can bind to this to get a reference to the element. Default: null | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
child | Snippet See type definition - type ChildSnippetProps = &#123;
 open: boolean;
 props: Record&lt;string, unknown&gt;;
&#125;; | Use render delegation to render your own element. See Child Snippet docs for more information. Default: —— undefined | See type definition
Data Attribute | Value | Description | Details
data-state | enum See enum options - 'open' | 'closed' | The state of the dialog. | See type definition
data-starting-style | '' | Present during the initial open frame. Use this to define the starting styles for CSS transitions. | See type definition
data-ending-style | '' | Present while closing before unmount. Use this to define the ending styles for CSS transitions. | See type definition
data-dialog-overlay | '' | Present on the overlay. | See type definition
data-nested-open | '' | Present when one or more nested dialogs are open within this dialog. Can be used to style parent dialogs differently when children are open. | See type definition
data-nested | '' | Present when the dialog is a nested dialog, useful for hiding the overlay of nested dialogs to avoid overlapping with the root dialog's overlay. | See type definition
CSS Variable | Description | Details
--bits-dialog-depth | The nesting depth of the dialog (0 for root dialogs, 1 for first nested, etc.). | CSS Variable details
--bits-dialog-nested-count | The number of currently open nested dialogs within this dialog. Updates reactively as nested dialogs open and close. | CSS Variable details
### Dialog. Close
A button used to close the dialog.
Property | Type | Description | Details
ref $bindable | HTMLButtonElement | The underlying DOM element being rendered. You can bind to this to get a reference to the element. Default: null | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
child | Snippet See type definition - type SnippetProps = &#123;
 props: Record&lt;string, unknown&gt;;
&#125;; | Use render delegation to render your own element. See Child Snippet docs for more information. Default: —— undefined | See type definition
Data Attribute | Value | Description | Details
data-dialog-close | '' | Present on the close button. | See type definition
### Dialog. Title
An accessible title for the dialog.
Property | Type | Description | Details
level | union See type definition - 1 | 2 | 3 | 4 | 5 | 6 | The heading level of the title. Default: 3 | See type definition
ref $bindable | HTMLDivElement | The underlying DOM element being rendered. You can bind to this to get a reference to the element. Default: null | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
child | Snippet See type definition - type SnippetProps = &#123;
 props: Record&lt;string, unknown&gt;;
&#125;; | Use render delegation to render your own element. See Child Snippet docs for more information. Default: —— undefined | See type definition
Data Attribute | Value | Description | Details
data-dialog-title | '' | Present on the title. | See type definition
### Dialog. Description
An accessible description for the dialog.
Property | Type | Description | Details
ref $bindable | HTMLDivElement | The underlying DOM element being rendered. You can bind to this to get a reference to the element. Default: null | See type definition
children | Snippet | The children content to render. Default: —— undefined | See type definition
child | Snippet See type definition - type SnippetProps = &#123;
 props: Record&lt;string, unknown&gt;;
&#125;; | Use render delegation to render your own element. See Child Snippet docs for more information. Default: —— undefined | See type definition
Data Attribute | Value | Description | Details
data-dialog-description | '' | Present on the description. | See type definition
Previous
Date Range Picker
Next
Dropdown Menu