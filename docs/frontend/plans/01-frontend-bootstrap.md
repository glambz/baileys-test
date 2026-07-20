# Plan 01: Frontend Bootstrap

**Goal**: Scaffold a Vite + React 18 + TypeScript single-page app under `frontend/` with Tailwind CSS, shadcn/ui, and the agreed dev tooling, and verify `npm run dev` boots a blank shadcn-styled page.
**Owner**: @frontend-dev
**Created**: 2026-06-30

## Status
- [x] `done`

## Dependencies
- Plan 02 (will live inside the scaffold; this plan only creates the empty shell so Plan 02 can write `frontend/src/types/` and `frontend/src/mock/` against it).

## Micro-Tasks

1. **Initialize the Vite project**
   - Run `npm create vite@latest frontend -- --template react-ts` from the project root using Node 20.x (matches the `.nvmrc` pin per `docs/tech/frontend-stack.md` §7).
   - Set `"packageManager": "pnpm@9.x"` in `frontend/package.json` and add `"engines": { "node": ">=20" }` per `docs/tech/frontend-stack.md` §7.
   - Install runtime deps: `react-router-dom@^6`, `@tanstack/react-query@^5`, `zustand@^4`, `lucide-react`, `dayjs@^1`, `zod@^3`, `react-hook-form@^7`, `@hookform/resolvers@^3`, `clsx`, `tailwind-merge`, `class-variance-authority`.
   - Install dev deps: `tailwindcss@^3`, `postcss`, `autoprefixer`, `prettier@^3`, `prettier-plugin-tailwindcss`, `eslint@^9`, `@typescript-eslint/*`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `vite-plugin-svgr` (optional).
   - **Acceptance**: `frontend/package.json` exists, `pnpm install` completes with exit code 0, and `pnpm tsc --noEmit` reports 0 errors on the default Vite template.

2. **Wire Tailwind CSS and shadcn/ui base**
   - Run `pnpm tailwindcss init -p` and replace the generated config with the shadcn/ui v0.5 template (TS, content globs for `index.html` + `./src/**/*.{ts,tsx}`).
   - Replace `frontend/src/index.css` with the shadcn CSS variables block (HSL `--background`, `--foreground`, `--primary`, etc., both `:root` for light and `.dark` for dark mode).
   - Add `frontend/src/lib/utils.ts` exporting `cn(...inputs: ClassValue[]): string` (the standard shadcn `clsx` + `tailwind-merge` helper).
   - Initialize shadcn/ui via `pnpm dlx shadcn@latest init` (accept defaults: TypeScript, neutral base color, CSS variables). Commit the resulting `components.json`, `tsconfig.json` paths alias `@/*` → `./src/*`, and `tailwind.config.ts` updates.
   - **Acceptance**: `pnpm dlx shadcn@latest add button card skeleton` installs 3 components into `frontend/src/components/ui/` and the resulting app still type-checks.

3. **Replace the Vite starter page with a blank shadcn page**
   - Delete the `frontend/src/App.tsx` Vite logo markup and the default `assets/` folder.
   - Replace `App.tsx` with a `<div className="min-h-screen bg-background text-foreground flex items-center justify-center"><Card><CardHeader><CardTitle>WhatsApp Frontend — boot OK</CardTitle></CardHeader></Card></div>`.
   - Add a `<html lang="id" className="dark">` (default to dark) to `frontend/index.html` and a viewport meta tag.
   - **Acceptance**: `pnpm dev` boots, the page at `http://localhost:5173/` renders the "boot OK" card centered on a dark background, and the browser console has zero errors.

4. **Configure linting and formatting**
   - Add `.eslintrc.cjs` (or `eslint.config.js` for flat config) extending `@typescript-eslint/recommended`, `react`, `react-hooks`, `react-refresh`; add a rule that rejects `@typescript-eslint/no-explicit-any` in `frontend/src/mock/**`.
   - Add `.prettierrc` with `{ "semi": true, "singleQuote": true, "plugins": ["prettier-plugin-tailwindcss"] }` and a `.prettierignore` covering `node_modules` and `dist`.
   - Add npm scripts: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"lint": "eslint . --max-warnings 0"`, `"format": "prettier --write ."`, `"typecheck": "tsc -b --noEmit"`, `"preview": "vite preview"`.
   - **Acceptance**: `pnpm lint` exits 0 on the boot-OK app; `pnpm typecheck` exits 0; `pnpm build` exits 0 and emits `frontend/dist/index.html`.

5. **Add `.gitignore` and project-root documentation pointer**
   - Create `frontend/.gitignore` covering `node_modules`, `dist`, `.vite`, `*.local`, `.DS_Store`.
   - Append a one-line note to the project `README.md` (if absent, create it) saying "Frontend mock lives under `frontend/`; see `docs/frontend/general/MODULE_OVERVIEW.md`." Do not edit `package.json` at the project root.
   - **Acceptance**: `git status frontend/` (when the project becomes a git repo) shows no `node_modules`/`dist`; the project `README.md` mentions the frontend module exactly once.

## Cross-References
- Stack constraints: `docs/tech/frontend-stack.md` §1 (Vite, TS, ESLint, Prettier), §2 (React, Router, Query, Zustand), §3 (Tailwind, shadcn/ui, lucide, dayjs), §7 (Node 20.x, pnpm 9.x pin).
- Module scope: `docs/frontend/general/MODULE_OVERVIEW.md` §3 (locked stack table), §5 (mock-vs-real boundary — this plan sits on the mock side).
- shadcn/ui entry: `docs/tech/frontend-stack.md` §3.

## Notes
- Do **not** create `frontend/src/types/`, `frontend/src/mock/`, `frontend/src/hooks/`, or `frontend/src/lib/contactLabel.ts` here — Plan 02 owns those.
- Do **not** touch the project-root `package.json`, `src/`, `inbox_logs/`, or `auth_info/`.
- The shadcn `components.json` lives at `frontend/components.json` (shadcn default); the `@/*` path alias must point at `frontend/src/*` so subsequent plans can `import { ... } from "@/lib/contactLabel"`.
- If `pnpm dlx shadcn@latest init` prompts interactively in a non-interactive shell, pass `--yes --defaults` (or pre-create `components.json` with the documented defaults) so the plan does not deadlock.