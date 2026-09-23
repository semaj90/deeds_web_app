# Child Snippet Documentation
Learn how to use the `child` snippet to render your own elements.
This is a documentation section that potentially contains examples, demos, and other
 useful information related to a specific part of Bits UI. When helping users with this
 documentation, you can ignore the classnames applied to the demos unless they are
 relevant to the user's issue.
Copy Page
### Epicenter
Open source, local first apps
Special Sponsor
The
`child`
snippet is a powerful feature that gives you complete control over the rendered elements in Bits UI components, allowing for customization while maintaining accessibility and functionality.
## When to Use It
You should use the
`child`
snippet when you need:
Svelte-specific features like transitions, animations, actions, or scoped styles
Integration with custom components in your application
Precise control over the DOM structure
Advanced composition of components
## Basic Usage
Many Bits UI components have default HTML elements that wrap their content. For example,
`Accordion.Trigger`
renders a
`<button>`
element by default:
```
<button {...props}>
  {@render children()}
</button>
```
When you need to customize this element, the
`child`
snippet lets you take control:
```
<script lang="ts">
  import MyCustomButton from "$lib/components";
  import { Accordion } from "bits-ui";
</script>
 
<Accordion.Trigger>
  {#snippet child({ props })}
    <MyCustomButton {...props}>Toggle Item</MyCustomButton>
  {/snippet}
</Accordion.Trigger>
 
<!-- or -->
 
<Accordion.Trigger>
  {#snippet child({ props })}
    <button {...props} class="scoped-button">Toggle Item</button>
  {/snippet}
</Accordion.Trigger>
 
<style>
  .scoped-button {
    background-color: #3182ce;
    color: #fff;
  }
</style>
```
In this example:
The
`props`
parameter contains all necessary attributes and event handlers
The
`{...props}`
spread applies these to your custom element/component
You can add scoped styles, transitions, actions, etc. directly to the element
## How It Works
When you use the
`child`
snippet:
The component passes all internal props and your custom props passed to the component via the
`props`
snippet parameter
You decide which element receives these props
The component's internal logic continues to work correctly
### Behind the Scenes
Components that support the
`child`
snippet typically implement logic similar to:
```
<script lang="ts">
  // Bits UI component internal logic
  let { child, children, ...restProps } = $props();
  const trigger = makeTrigger();
 
  // Merge internal props with user props
  const mergedProps = $derived(mergeProps(restProps, trigger.props));
</script>
 
{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <button {...mergedProps}>
    {@render children?.()}
  </button>
{/if}
```
## Working with Props
### Custom IDs & Attributes
To use custom IDs, event handlers, or other attributes, pass them to the component first:
```
<Accordion.Trigger
  id="my-custom-id"
  data-testid="accordion-trigger"
  onclick={() => console.log("clicked")}
>
  {#snippet child({ props })}
    <button {...props}>Open accordion item</button>
  {/snippet}
</Accordion.Trigger>
```
The
`props`
object will now include:
Your custom ID (
`id="my-custom-id"`
)
Your data attribute (
`data-testid="accordion-trigger"`
)
Your click event handler, properly merged with internal handlers
All required ARIA attributes and internal event handlers
## Combining with Svelte Features
You can apply Svelte-specific features to your custom elements, such as transitions, actions, and scoped styles:
```
<Accordion.Trigger>
  {#snippet child({ props })}
    <div {...props} use:myCustomAction class="my-custom-trigger">
      <!-- ... -->
    </div>
  {/snippet}
</Accordion.Trigger>
 
<style>
  .my-custom-trigger {
    background-color: #3182ce;
    color: #fff;
  }
</style>
```
## Floating Components
Floating content components (tooltips, popovers, dropdowns, etc.) require special handling due to their positioning requirements.
### Required Structure
For floating components, you must use a two-level structure:
An
outer wrapper element
with
`{...wrapperProps}`
An
inner content element
with
`{...props}`
```
<Popover.Content>
  {#snippet child({ wrapperProps, props, open })}
    {#if open}
      <div {...wrapperProps}>
        <div {...props}>
          <!-- ... -->
        </div>
      </div>
    {/if}
  {/snippet}
</Popover.Content>
```
### Important Rules for Floating Content
The wrapper element with
`{...wrapperProps}`
must remain
unstyled
Positioning is handled by the wrapper element; styling goes on the inner content element
The
`open`
parameter lets you conditionally render the content, triggering Svelte transitions
Always maintain this two-level structure to ensure proper positioning and behavior
### Components Requiring Wrapper Elements
The following components require a wrapper element:
`Combobox.Content`
`DatePicker.Content`
`DateRangePicker.Content`
`DropdownMenu.Content`
`LinkPreview.Content`
`Menubar.Content`
`Popover.Content`
`Select.Content`
`Tooltip.Content`
## Examples
### Basic Custom Element
```
<Collapsible.Trigger>
  {#snippet child({ props })}
    <button {...props}>
      <Icon name="star" />
      <span>Favorite</span>
    </button>
  {/snippet}
</Collapsible.Trigger>
```
### With Svelte Transitions
```
<Dialog.Content>
  {#snippet child({ props, open })}
    {#if open}
      <div {...props} transition:scale={{ start: 0.95 }}>
        Dialog content with a scale transition
      </div>
    {/if}
  {/snippet}
</Dialog.Content>
```
### Floating Element Example
```
<Tooltip.Content>
  {#snippet child({ wrapperProps, props, open })}
    {#if open}
      <div {...wrapperProps}>
        <div {...props} transition:fade>Custom tooltip content</div>
      </div>
    {/if}
  {/snippet}
</Tooltip.Content>
```
## Common Pitfalls
Missing props spread
: Always include
`{...props}`
on your custom element
Styling the wrapper
: Never style the wrapper element in floating components
Direct children
: When using child, other children outside the snippet are ignored
Missing structure
: For floating elements, forgetting the two-level structure will break positioning
## Related Resources
mergeProps
Utility
Styling Guide
Transitions Guide
Previous
Getting Started
Next
Ref