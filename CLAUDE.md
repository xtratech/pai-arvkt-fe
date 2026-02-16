# CLAUDE.md — Pluree Toolkit Frontend (pai-arvkt-fe-PROD)

## Project Overview

Pluree Toolkit is a SaaS dashboard application for managing AI agents/sessions, knowledge bases, chat interfaces, and token wallets. Built on top of the NextAdmin template.

## Tech Stack

- **Framework:** Next.js 15.5 (App Router, Server & Client Components)
- **Language:** TypeScript 5 (strict mode)
- **UI:** React 19, Tailwind CSS 3.4, Framer Motion 12
- **Auth:** AWS Amplify 6 + Cognito (region: ap-southeast-1)
- **Storage:** AWS S3 (sessions, system prompts, knowledge bases)
- **API:** AWS API Gateway REST endpoints via custom Amplify wrapper
- **Payments:** Stripe (checkout sessions, setup intents)
- **Charts:** ApexCharts
- **State:** React Context only (no Redux/Zustand)
- **Fonts:** Space Grotesk, Space Mono, Satoshi

## Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm start         # Start production server
npm run lint      # ESLint check (next/core-web-vitals)
```

No test suite is configured.

## Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (home)/             # Landing page (route group)
│   ├── api/backend/        # Backend proxy route (catch-all)
│   ├── auth/               # sign-in, sign-up, forgot-password
│   ├── dashboard/          # Main dashboard
│   ├── sessions/           # Sessions/agents list
│   ├── session/            # Session detail, create, edit
│   ├── kb/                 # Knowledge base management
│   ├── kb-articles/        # KB articles list
│   ├── chat/               # Chat interface
│   ├── chat-editor/        # Chat training editor (chromeless)
│   ├── case-study/         # Case study page (chromeless)
│   ├── guide/              # Guide page
│   ├── system-prompt/      # System prompt management
│   ├── user-prompt/        # User prompt management
│   ├── tools/              # Tools page
│   ├── web-widget-editor/  # Web widget editor (chromeless)
│   ├── user-wallet/        # User wallet page
│   ├── pages/settings/     # User settings
│   ├── profile/            # User profile
│   ├── terms/              # Terms page
│   ├── payment-success/    # Stripe success redirect
│   ├── payment-failure/    # Stripe failure redirect
│   ├── calendar/           # Calendar page (template)
│   ├── charts/             # Charts showcase (template)
│   ├── forms/              # Forms showcase (template)
│   ├── tables/             # Tables showcase (template)
│   ├── ui-elements/        # UI elements showcase (template)
│   ├── layout.tsx          # Root layout
│   └── providers.tsx       # Global providers
├── assets/                 # Static assets
│   ├── icons/              # Icon SVGs
│   ├── icons.tsx           # Icon React components
│   └── logos/              # Logo assets
├── components/             # Reusable components
│   ├── Auth/               # Auth guards, forms & PasswordlessAuth
│   ├── Layouts/            # App shell, header, sidebar
│   ├── Charts/             # Chart components
│   ├── FormElements/       # Form inputs
│   ├── Tables/             # Table components
│   ├── ui/                 # Base UI elements
│   └── chat/               # Chat UI
├── contexts/               # React Context providers
│   └── user-context.tsx    # Auth state (user, tokens, attributes)
├── services/               # API & business logic
│   ├── api-client.ts       # REST client (wraps Amplify)
│   ├── sessions.ts         # Session CRUD
│   ├── user-wallet.ts      # Wallet, payments, Stripe
│   ├── profile.ts          # Profile data
│   ├── storage-paths.ts    # S3 path builders
│   ├── kb-source-articles.ts  # KB articles
│   ├── chat-async-jobs.ts  # Chat job management
│   └── charts.services.ts  # Chart data services
├── hooks/                  # Custom hooks
│   ├── use-mobile.ts       # Mobile breakpoint detection
│   ├── use-click-outside.ts
│   └── use-idle-resume-check.ts
├── lib/                    # Utility libraries
│   ├── amplify.ts          # AWS Amplify config
│   ├── auth-headers.ts     # Bearer token construction
│   ├── utils.ts            # cn() — clsx + tailwind-merge
│   ├── format-number.ts
│   └── format-message-time.ts
├── js/                     # Static JS assets (map data)
├── types/                  # TypeScript type definitions
├── utils/                  # Utility functions
├── css/                    # Global styles (satoshi.css, style.css)
└── fonts/                  # Custom font files
```

## Architecture & Patterns

### Server vs Client Components
- **Pages** (`page.tsx`) are Server Components by default
- **Interactive UI** lives in `_components/` subdirectories as Client Components (`"use client"`)
- Data fetching helpers are in `fetch.ts` files colocated with pages

### Service Layer
- `api-client.ts` wraps AWS Amplify REST with typed generics: `apiGet<T>()`, `apiPost<T>()`, etc.
- Custom `ApiClientError` class for error handling
- Services are imported by client components and called in `useEffect`

### State Management
- **UserContext** — auth user, tokens, attributes, refresh/signOut actions
- **SidebarContext** (`src/components/Layouts/sidebar/sidebar-context.tsx`) — sidebar open/close, mobile detection
- **Custom events** — `pluree:user-wallet-updated` for cross-component updates
- Local `useState` for component-specific state

### Routing
- **Protected routes:** Everything except `/`, `/auth/**`, `/case-study`, `/payment-*`
- **Auth guard:** `RequireAuth` component wraps protected pages
- **Chromeless paths:** `/chat-editor`, `/case-study`, `/web-widget-editor` (no sidebar/header)
- **Route groups:** `(home)` for the landing page

### Storage
- S3 paths built via `storage-paths.ts`: `{folder}/{userId}/{sessionId}/{filename}`
- Sessions support both S3 bucket and legacy API endpoint fallback

## Conventions

### File Naming
- Pages: `page.tsx` (Next.js convention)
- Components: **PascalCase** directories & files (e.g., `Auth/RequireAuth.tsx`)
- Services/hooks/lib: **kebab-case** (e.g., `api-client.ts`, `use-mobile.ts`)
- Nested page components: `_components/` subdirectory (underscore prefix)

### Component Pattern
```tsx
"use client";
import { useUser } from "@/contexts/user-context";
import { fetchSessions } from "@/services/sessions";

export function MyComponent() {
  const { user } = useUser();
  const [data, setData] = useState([]);

  useEffect(() => {
    if (user?.userId) {
      fetchSessions(user.userId).then(setData);
    }
  }, [user?.userId]);

  return <div className="rounded-lg bg-white p-4 dark:bg-gray-dark">...</div>;
}
```

### Styling
- Tailwind CSS utility classes exclusively (no CSS modules, no BEM)
- Dark mode first (default theme: `dark`, class-based toggling via `next-themes`)
- Use `cn()` from `@/lib/utils` for conditional class merging
- Custom colors defined in `tailwind.config.ts` (cyborg theme: obsidian, neon-yellow, neon-lime, soft-violet)
- Responsive: mobile-first with custom breakpoints (2xsm: 375px, xsm: 425px, 3xl: 2000px)

### Imports
- Path alias: `@/*` → `./src/*`
- Always use `@/` imports, never relative paths outside the current directory

## Environment Variables

All public env vars use `NEXT_PUBLIC_` prefix. Key groups:

- **Auth:** `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_USER_POOL_CLIENT_ID`
- **APIs:** `USERDATA_API_ENDPOINT`, `USERWALLET_API_ENDPOINT`, `KB_API_ENDPOINT`, `PAYMENTS_API_ENDPOINT`
- **Storage:** `DATA_BUCKET`, `S3_SESSIONS_FOLDER`, `S3_SYSTEMPROMPTS_FOLDER`, `S3_KBS_FOLDER`
- **Stripe:** `STRIPE_PUBLISHABLE_KEY`, `WALLET_PACKAGE_TOKENS`, `WALLET_PACKAGE_PRICE_CENTS`
- **Chat:** `TARGET_CHATBOT_SETTINGS_PATH`
- **Backend proxy:** `BACKEND_BASE_URL`, `BACKEND_API_KEY` (server-side only, no `NEXT_PUBLIC_` prefix)

Env files: `.env.dev`, `.env.uat`, `.env.prod`, `.env.local` (gitignored), `.env.example` (template)

## External Integrations

- **AWS Cognito** — Authentication
- **AWS API Gateway** — REST endpoints for user data, wallet, KB, payments
- **AWS S3** — File/config storage
- **Stripe** — Token package purchases (test mode keys in `.env.example`)
- **Sanity CMS** — Image CDN
- **Cloudflare R2** — Additional image hosting

## Key Files to Know

| Purpose | File |
|---|---|
| Root layout | `src/app/layout.tsx` |
| Global providers | `src/app/providers.tsx` |
| Amplify config | `src/lib/amplify.ts` |
| API client | `src/services/api-client.ts` |
| Auth context | `src/contexts/user-context.tsx` |
| Auth guard | `src/components/Auth/RequireAuth.tsx` |
| App shell | `src/components/Layouts/app-shell.tsx` |
| Sidebar nav data | `src/components/Layouts/sidebar/data/index.ts` |
| Tailwind config | `tailwind.config.ts` |
| Auth feature flags | `src/components/Auth/auth-feature-flags.ts` |
| Passwordless auth | `src/components/Auth/PasswordlessAuth.tsx` |
| Sidebar context | `src/components/Layouts/sidebar/sidebar-context.tsx` |
| Backend proxy | `src/app/api/backend/[...path]/route.ts` |

## Recently Disabled Features

- Google login button (disabled in code)
- Sign-up page (disabled — sign-in only)

## Recent Additions

- Passwordless authentication (`PasswordlessAuth.tsx`)
- Backend API proxy route (`api/backend/[...path]`)
- System prompt, user prompt, and tools management pages
- Web widget editor (chromeless)
