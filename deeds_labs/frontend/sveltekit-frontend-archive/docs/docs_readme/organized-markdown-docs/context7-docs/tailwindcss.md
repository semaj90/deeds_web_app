# Tailwind CSS Quick Reference

Tailwind CSS is a utility-first CSS framework for rapidly building custom user interfaces.

## Key Concepts

- **Utility Classes:** Apply single-purpose classes directly in your HTML (e.g., `bg-blue-500`, `p-4`).
- **Responsive Design:** Use breakpoint prefixes (e.g., `md:`, `lg:`) for different screen sizes.
- **Dark Mode:** Use `dark:` prefix to style for dark themes.
- **Customization:** Configure your design system in `tailwind.config.js`.

## Best Practices

- Compose UIs using utility classes instead of custom CSS.
- Use `@apply` for extracting repeated utility patterns.
- Use `prose` for rich text content.
- Remove unused classes in production with PurgeCSS.

## Common Gotchas

- Class name typos will silently do nothing.
- Overly long class lists can reduce readability; group logically.

## References

- [Tailwind CSS Docs](https://tailwindcss.com/docs)
