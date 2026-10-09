💎 Zod 4.6 is out! [Read the announcement.](https://zod.dev/blog/zod-4-6)

Ask AI
![Chat avatar](https://zod.dev/logo/logo.png)

[NewZod 4.6](https://zod.dev/blog/zod-4-6)

![Zod logo](https://zod.dev/_next/image?url=%2Flogo%2Flogo-glow.png&w=640&q=100)![Zod logo](https://zod.dev/_next/image?url=%2Flogo%2Flogo-glow.png&w=640&q=100)

# Zod

TypeScript-first schema validation with static type inference

by [@colinhacks](https://x.com/colinhacks)

[![Zod CI status](https://github.com/colinhacks/zod/actions/workflows/test.yml/badge.svg?event=push&branch=main)](https://github.com/colinhacks/zod/actions?query=branch%3Amain)[![Created by Colin McDonnell](https://img.shields.io/badge/created%20by-@colinhacks-4BBAAB.svg)](https://twitter.com/colinhacks)[![License](https://img.shields.io/github/license/colinhacks/zod)](https://opensource.org/licenses/MIT)[![npm](https://img.shields.io/npm/dw/zod.svg)](https://www.npmjs.com/package/zod)[![stars](https://img.shields.io/github/stars/colinhacks/zod)](https://github.com/colinhacks/zod)

[Website](https://zod.dev/)  •  [Discord](https://discord.gg/RcG33DQJdf)  •  [𝕏](https://twitter.com/colinhacks)  •  [Bluesky](https://bsky.app/profile/zod.dev)

Zod 4 is stable. Read the [release notes](https://zod.dev/v4) and [migration guide](https://zod.dev/v4/changelog).

## [Introduction](https://zod.dev/?id=introduction\#introduction)

Zod is a TypeScript-first validation library. Using Zod, you can define _schemas_ you can use to validate data, from a simple `string` to a complex nested object.

```
import * as z from "zod";

const User = z.object({
  name: z.string(),
});

// some untrusted data...
const input = { /* stuff */ };

// the parsed result is validated and type safe!
const data = User.parse(input);

// so you can use it with confidence :)
console.log(data.name);
```

## [Features](https://zod.dev/?id=features\#features)

- Zero external dependencies
- Works in Node.js and all modern browsers
- Tiny: 2kb core bundle (gzipped)
- Immutable API: methods return a new instance
- Concise interface
- Works with TypeScript and plain JS
- Built-in JSON Schema conversion
- Extensive ecosystem

## [Installation](https://zod.dev/?id=installation\#installation)

```
npm install zod
```

Zod is also available as `@zod/zod` on [jsr.io](https://jsr.io/@zod/zod).

Zod provides an MCP server that can be used by agents to search Zod's docs. To add to your editor, follow [these instructions](https://share.inkeep.com/zod/mcp). Zod also provides an [llms.txt](https://zod.dev/llms.txt) file.

## [Requirements](https://zod.dev/?id=requirements\#requirements)

Zod is tested against _TypeScript v5.5_ and later. Older versions may work but are not officially supported.

### [`"strict"`](https://zod.dev/?id=strict\#strict)

You must enable `strict` mode in your `tsconfig.json`. This is a best practice for all TypeScript projects.

```
// tsconfig.json
{
  // ...
  "compilerOptions": {
    // ...
    "strict": true
  }
}
```

## [Ecosystem](https://zod.dev/?id=ecosystem\#ecosystem)

Zod has a thriving ecosystem of libraries, tools, and integrations. Refer to the [Ecosystem page](https://zod.dev/ecosystem) for a complete list of libraries that support Zod or are built on top of it.

- [Resources](https://zod.dev/ecosystem?id=resources)
- [API Libraries](https://zod.dev/ecosystem?id=api-libraries)
- [Form Integrations](https://zod.dev/ecosystem?id=form-integrations)
- [Zod to X](https://zod.dev/ecosystem?id=zod-to-x)
- [X to Zod](https://zod.dev/ecosystem?id=x-to-zod)
- [Mocking Libraries](https://zod.dev/ecosystem?id=mocking-libraries)
- [Powered by Zod](https://zod.dev/ecosystem?id=powered-by-zod)

I also contribute to the following projects, which I'd like to highlight:

- [tRPC](https://trpc.io/) \- End-to-end typesafe APIs, with support for Zod schemas
- [React Hook Form](https://react-hook-form.com/) \- Hook-based form validation with a [Zod resolver](https://react-hook-form.com/docs/useform#resolver)
- [zshy](https://github.com/colinhacks/zshy) \- Originally created as Zod's internal build tool. Bundler-free, batteries-included build tool for TypeScript libraries. Powered by `tsc`.

## [Sponsors](https://zod.dev/?id=sponsors\#sponsors)

Sponsorship at any level is appreciated and encouraged. If you built a paid product using Zod, consider one of the [corporate tiers](https://github.com/sponsors/colinhacks).

### [Platinum](https://zod.dev/?id=platinum\#platinum)

[![Trigger.dev logo (dark theme)](https://trigger.dev/assets/triggerdev-lockup--light.svg)![Trigger.dev logo (light theme)](https://trigger.dev/assets/triggerdev-lockup--dark.svg)](https://trigger.dev/?utm_source=zod)

Build and deploy fully-managed AI agents and workflows

[trigger.dev](https://trigger.dev/?utm_source=zod)

### [Gold](https://zod.dev/?id=gold\#gold)

[![CodeRabbit logo (light theme)](https://github.com/user-attachments/assets/d791bc7d-dc60-4d55-9c31-97779839cb74)![CodeRabbit logo (dark theme)](https://github.com/user-attachments/assets/eea24edb-ff20-4532-b57c-e8719f455d6d)](https://www.coderabbit.ai/)

Cut code review time & bugs in half

[coderabbit.ai](https://www.coderabbit.ai/)

### [Silver](https://zod.dev/?id=silver\#silver)

[![Subtotal logo](https://avatars.githubusercontent.com/u/176449348?s=200&v=4)subtotal.com](https://www.subtotal.com/?utm_source=zod)

[![PropelAuth logo](https://avatars.githubusercontent.com/u/89474619?s=200&v=4)propelauth.com](https://www.propelauth.com/)

[![Scalar logo](https://avatars.githubusercontent.com/u/301879?s=200&v=4)scalar.com](https://scalar.com/)

[![Transloadit logo](https://avatars.githubusercontent.com/u/125754?s=200&v=4)transloadit.com](https://transloadit.com/?utm_source=zod&utm_medium=referral&utm_campaign=sponsorship&utm_content=github)

[![Whop logo](https://avatars.githubusercontent.com/u/91036480?s=200&v=4)whop.com](https://whop.com/)

[![Inngest logo](https://avatars.githubusercontent.com/u/78935958?s=200&v=4)inngest.com](https://inngest.com/)

[![Storyblok logo](https://avatars.githubusercontent.com/u/13880908?s=200&v=4)storyblok.com](https://storyblok.com/)

[![Mux logo](https://avatars.githubusercontent.com/u/16199997?s=200&v=4)mux.link/zod](https://mux.link/zod)

[![Cybozu logo](https://avatars.githubusercontent.com/u/76428554?s=200&v=4)cybozu.co.jp](https://www.cybozu.co.jp/)

[![9thCO logo](https://avatars.githubusercontent.com/u/117220588?s=200&v=4)9thco.com](https://www.9thco.com/?utm_source=zod)

[![StackBlitz logo](https://avatars.githubusercontent.com/u/28635252?s=200&v=4)stackblitz.com](https://stackblitz.com/?utm_source=zod)

### [Bronze](https://zod.dev/?id=bronze\#bronze)

[![Code for Japan logo](https://zod.dev/sponsors/code-for-japan.png)](https://www.code4japan.org/?utm_source=zod)[code4japan.org](https://www.code4japan.org/?utm_source=zod)

[![Jason Laster logo](https://avatars.githubusercontent.com/u/254562?s=200&v=4)](https://github.com/jasonLaster)[github.com/jasonLaster](https://github.com/jasonLaster)

[![Convex logo](https://avatars.githubusercontent.com/u/81530787?s=200&v=4)](https://convex.dev/?utm_source=zod)[convex.dev](https://convex.dev/?utm_source=zod)

[![n8n logo](https://avatars.githubusercontent.com/u/104988782?s=200&v=4)](https://n8n.io/?utm_source=zod)[n8n.io](https://n8n.io/?utm_source=zod)

[![Route4Me logo](https://avatars.githubusercontent.com/u/7936820?s=200&v=4)](https://www.route4me.com/?utm_source=zod)[route4me.com](https://www.route4me.com/?utm_source=zod)

[Basic usage\\
\\
Basic usage guide covering schema definition, parsing data, error handling, and type inference](https://zod.dev/basics)

### On this page

[Introduction](https://zod.dev/#introduction) [Features](https://zod.dev/#features) [Installation](https://zod.dev/#installation) [Requirements](https://zod.dev/#requirements) [`"strict"`](https://zod.dev/#strict) [Ecosystem](https://zod.dev/#ecosystem) [Sponsors](https://zod.dev/#sponsors) [Platinum](https://zod.dev/#platinum) [Gold](https://zod.dev/#gold) [Silver](https://zod.dev/#silver) [Bronze](https://zod.dev/#bronze)