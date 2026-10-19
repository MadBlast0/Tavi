# Agent instructions

## Commits

**Never attribute a commit to an AI.** Concretely:

- Use the repository's configured identity (see below). Do not pass
  `-c user.name=` / `-c user.email=` overrides.
- Do not add `Co-Authored-By:`, `Generated with`, or any similar trailer.
- Do not sign off as an assistant, tool, or model in the message body.
- If an AI made the change, the human who asked for it owns it.

The identity is set in the repo's local config so it applies without a global
fallback:

```sh
git config --local user.name
git config --local user.email
```

If either is empty, do not invent one and do not fall back to an assistant
identity — ask the maintainer.

## Before committing

- `pnpm typecheck` must be clean.
- Confirm nothing under `node_modules/`, `dist/`, or `src-tauri/target/` is
  staged; those are ignored but large enough to matter.
- Never commit `.env`, `.env.local`, or any file holding a credential.

## Working on this repo

- The app surface is `src/blocks/prompt-input/prompt-block.tsx`. It is the whole
  app, not a demo — `src/App.tsx` renders it directly.
- The chat server is `server/chat.ts`, proxied at `/api` in `vite.config.ts`.
- **No invented data.** Do not add placeholder rows, fake metrics, or
  decorative UI that pretends to work. If a feature has no backend behind it,
  either build the backend or say so in the UI and in `README.md` → Known
  limitations.
- **No hidden fallbacks.** The server refuses a chat request that carries no
  model (`400`) rather than substituting a default. Keep it that way.
- `server/chat.ts` never logs request bodies, headers, or the API key.

## Icons

**Use `lucide-react`, not `@tabler/icons-react`.**

`components.json` sets `"iconLibrary": "lucide"`, which is shadcn's own default
and what any new `shadcn add` will generate. The assistant-ui elements
(`src/components/assistant-ui/*.aui.tsx`) hardcode Lucide and ignore that setting
entirely. Following Lucide means regenerating a component produces what the
codebase already has, instead of re-introducing the other pack every time.

A number of checked-in shadcn block files were scaffolded with Tabler. Those are
being migrated to Lucide; do not add new Tabler imports.

The two packs are not interchangeable at the same size — both stroke at 2px, but
their glyph proportions differ, so mixing them at `size-4` reads as a mistake.

Name icons `<Thing>Icon` and import from `lucide-react`.
