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

- `npx tsc --noEmit` must be clean.
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
