# Stack Decisions — `frontend/`

> Single source of truth for the locked-in frontend stack. Each line states
> one tool, the version family, and the one-sentence rationale. Do not
> introduce alternatives here without reopening the IAR.

## 1. Tooling

| Tool | Version | One-line rationale |
|---|---|---|
| **Vite** | `5.x` | Replaces the deprecated CRA toolchain; ESM-native dev server with sub-second cold start and instant HMR. |
| **TypeScript** | `5.x` | Compile-time safety for the data shapes in [`chat-data-model.md`](chat-data-model.md) and zod-validated API responses. |
| **ESLint** | `9.x` flat config | Lints React + TS sources and rejects the `@typescript-eslint/no-explicit-any` escape in the mock layer. |
| **Prettier** | `3.x` | Zero-config formatter; paired with `prettier-plugin-tailwindcss` to keep class lists canonical. |

## 2. Framework

| Tool | Version | One-line rationale |
|---|---|---|
| **React** | `18.x` | Stable concurrent renderer (`useTransition`, `useDeferredValue`) needed for streaming the AI answer and the chats sidebar. |
| **React Router** | `6.x` (data router) | Declarative `loader` / `action` model and built-in lazy-route code-splitting for `/chats` and `/ai-chat`. |
| **TanStack Query** | `5.x` | First-class `isLoading` / `isError` / `data` triple for every mock API call, plus background revalidation when the future real API arrives. |
| **Zustand** | `4.x` | ~1 kB store for cross-route UI state (auth banner, last-opened chat) that does not belong in a query cache. |

## 3. UI

| Tool | Version | One-line rationale |
|---|---|---|
| **Tailwind CSS** | `3.x` | Utility-first; pairs natively with shadcn/ui whose components assume Tailwind class names. |
| **shadcn/ui** | latest (CLI-installed) | Accessible Radix primitives shipped as owned source — no version-lock risk and full Tailwind control. |
| **lucide-react** | latest | Tree-shakable icon set used across both pages; identical visual language, one dependency. |
| **dayjs** | `1.x` | ~2 kB date formatter for `[YYYY-MM-DD HH:mm]` chat timestamps; smaller than date-fns/Luxon. |

## 4. Forms & validation

| Tool | Version | One-line rationale |
|---|---|---|
| **react-hook-form** | `7.x` | Uncontrolled-by-default composer in `/chats/:id` so the input does not re-render on every keystroke. |
| **zod** | `3.x` | Schema-validates both AI knowledge rows and mock API responses at the network boundary. |
| **@hookform/resolvers** | `3.x` | Glues zod schemas to react-hook-form with a single line. |

## 5. Testing (planned, not yet installed)

| Tool | Version | One-line rationale |
|---|---|---|
| **Vitest** | `1.x` | Native Vite integration, no Jest config, same transformer as the app. |
| **@testing-library/react** | `15.x` | Black-box RTL render tests for the contact-display rule and the fallback message. |
| **MSW** | `2.x` | Lets the future integration tests swap mocks for the real backend with zero component changes. |

## 6. What is NOT included (and why)

| Not used | Reason |
|---|---|
| Next.js / Remix | Vite is sufficient for a mock-only SPA; SSR adds deployment complexity for no current benefit. |
| Redux Toolkit | Zustand + TanStack Query already covers global state and server cache. |
| Axios | The native `fetch` API plus TanStack Query is enough; no interceptors needed yet. |
| Material UI / Ant Design | shadcn/ui is the agreed design system; mixing would break visual consistency. |
| date-fns / Luxon | dayjs is smaller and the only formatting we need is one chat-timestamp format. |

## 7. Version pinning policy

- Pinned via `package.json` ranges (`^`) for runtime deps; `~` for tooling
  whose upgrades rarely matter.
- A `.nvmrc` pins Node `20.x` so every contributor uses the same runtime
  that the existing Baileys backend in `src/` has been tested on (see
  `package.json:13` at the project root, `engines.node >=18`).
- `packageManager` field pins `pnpm@9.x` to keep the lockfile deterministic
  once `frontend/` is scaffolded.
