#!/bin/bash
echo "📥 Fetching documentation for legal AI web-app..."

mkdir -p docs/raw
urls=(
  # Core web technologies
  "https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/guide/index.html"
  "https://raw.githubusercontent.com/mdn/content/main/files/en-us/webassembly/index.html"
  
  # UI Framework documentation  
  "https://bits-ui.com/docs/getting-started"
  "https://bits-ui.com/docs/components/dialog"
  "https://bits-ui.com/docs/components/button"
  "https://bits-ui.com/docs/components/form"
  "https://next.melt-ui.com/guides/how-to-use"
  "https://next.melt-ui.com/docs/builders/dialog"
  
  # Styling and CSS
  "https://tailwindcss.com/docs/installation"
  "https://tailwindcss.com/docs/responsive-design"
  "https://tailwindcss.com/docs/dark-mode"
  
  # Database and ORM
  "https://orm.drizzle.team/docs/guides"
  "https://orm.drizzle.team/docs/kit-overview"
  "https://orm.drizzle.team/docs/quick-start"
  "https://www.postgresql.org/docs/current/tutorial.html"
  "https://www.postgresql.org/docs/current/queries.html"
  
  # AI/ML and LLM documentation
  "https://raw.githubusercontent.com/ggerganov/llama.cpp/master/README.md"
  "https://ollama.ai/docs"
  "https://docs.anthropic.com/claude/docs/intro-to-claude"
  
  # SvelteKit framework
  "https://kit.svelte.dev/docs/introduction"
  "https://kit.svelte.dev/docs/routing"
  "https://kit.svelte.dev/docs/load"
  "https://svelte.dev/docs/introduction"
  
  # TypeScript for legal applications
  "https://www.typescriptlang.org/docs/handbook/basic-types.html"
  "https://www.typescriptlang.org/docs/handbook/interfaces.html"
  
  # Legal tech specific
  "https://github.com/legal-tech-docs/api-standards"
  "https://github.com/evidence-management/best-practices"
)

for url in "${urls[@]}"; do
  echo "Fetching: $url"
  fname="docs/raw/$(echo "$url" | sed 's/[:\/]\+/_/g')"
  curl -sL "$url" -o "$fname.html" || echo "Failed to fetch $url"
  sleep 1 # Be respectful to servers
done

echo "✅ Documentation fetch complete!"
