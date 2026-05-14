# AGENTS.md

## Commands
- Install with `pnpm install`; this repo uses `pnpm-lock.yaml` and should not keep `package-lock.json`.
- Run dev server with `pnpm dev` (`vite`; server is configured with `host: true`, `cors: true`, `allowedHosts: true`).
- Verify changes with `pnpm build`; it runs `vue-tsc -b` before `vite build`.
- Deploy with Nixpacks/Coolify using `nixpacks.toml`: install `pnpm install --frozen-lockfile`, build `pnpm build`, start `pnpm start` on `$PORT`.
- There are no configured `test`, `lint`, or formatter scripts in `package.json`.

## App Structure
- Single Vue 3 + Vite app; entrypoint is `src/main.ts`, mounted root is `src/App.vue`.
- Routing uses `vue-router`; route definitions live in `src/router.ts`, and `src/App.vue` renders them with `RouterView`.
- Keep sidebar/navigation metadata in `src/App.vue` aligned with route paths in `src/router.ts` when adding views.
- API access is centralized in `src/api/apiService.ts`; prefer adding endpoint logic there instead of calling `fetch` from views/components.
- Shared domain types live in `src/types/index.ts`; update those when API payloads change.

## API Quirks
- `VITE_API_BASE_URL` overrides the API base URL; otherwise the app calls `https://api.familiarenacer.cl/api`.
- Some write requests intentionally send JSON with `Content-Type: text/plain` to avoid backend CORS preflight failures (`OPTIONS 405`). Do not “fix” these to `application/json` without checking the backend.
- The API service maps several backend naming variants (`snake_case`, camelCase, nested roots) into frontend types; preserve that tolerance unless the backend contract is confirmed stable.

## Styling
- Tailwind is loaded through `src/style.css` using `@import "tailwindcss"` plus `@tailwindcss/postcss` in `postcss.config.js`.
- Global design tokens and dark-mode overrides are in `src/style.css` (`--bg-base`, `--bg-card`, `--accent-color`, `surface-card`, `btn-*`, table helpers). Prefer those tokens/utilities over hard-coded `bg-white`, `text-gray-*`, or raw blue classes when touching UI.
- A repo-local OpenCode skill is installed at `.agents/skills/frontend-design`; use it for frontend UI work in this repo.

## TypeScript
- `tsconfig.app.json` and `tsconfig.node.json` are strict and enable `noUnusedLocals` and `noUnusedParameters`; unused imports, props, or helper args will fail `pnpm build`.
- The project uses ESM (`"type": "module"`); config files are ESM exports.
