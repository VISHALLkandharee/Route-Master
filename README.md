# Routemaster

Route optimization, automated client messaging, and supply tracking for mobile service professionals — pet groomers, pool cleaners, auto detailers, and anyone who drives to their clients.

## What It Does

**Route Optimization** — Add your jobs for the day, click Optimize, and get the most fuel-efficient driving order calculated automatically using OpenRouteService.

**AI Client Messages** — Generates a personalized arrival message for every client using Claude AI. Open WhatsApp with one tap to send it pre-filled.

**Supply Tracking** — Track what supplies you carry, log what you use per job, and get automatic low-stock alerts before you run out mid-day.

**Dashboard** — See jobs today, active clients, revenue, profit after supply costs, and what's coming up — all on one screen.

**Billing** — 14-day free trial, then $19/month or $190/year via Stripe. Full subscription management and customer portal included.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Styling | Tailwind CSS + shadcn/ui |
| Animations | Framer Motion |
| Maps | Leaflet.js |
| Routing API | OpenRouteService |
| AI Messages | Anthropic Claude |
| Payments | Stripe |
| State | Zustand + TanStack Query |
| Forms | React Hook Form + Zod |
| Deployment | Vercel |

## Getting Started Locally

### Prerequisites

- Node.js 18+
- Docker Desktop (for local Supabase)
- Git

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/routemaster.git
cd routemaster
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local` — see the Environment Variables section below for where to get each one.

### 3. Start local Supabase

```bash
npx supabase start
```

This starts a local PostgreSQL database, Auth server, and Supabase Studio at `http://127.0.0.1:54323`.

### 4. Run database migrations

```bash
npx supabase db reset
```

This applies all migrations and sets up your local database with the complete schema.

### 5. Start the development server

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

| Variable | Where to Get It |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → Secret keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_PRODUCT_ID` | Stripe Dashboard → Product catalog |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks |
| `NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID` | Stripe Dashboard → Product catalog |
| `NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID` | Stripe Dashboard → Product catalog |
| `OPENROUTESERVICE_API_KEY` | openrouteservice.org → Account → API Key |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL (or `http://localhost:3000` locally) |

## Database Schema

Seven tables with full Row Level Security:

```
users          → groomer profiles, subscription status, trial
clients        → clients belonging to each groomer
jobs           → scheduled visits with status tracking
routes         → daily optimized driving plans
supplies       → inventory items with quantities
supply_logs    → usage records per job (triggers auto-deduction)
subscriptions  → Stripe billing records
```

All tables use UUID primary keys, soft deletes, and `updated_at` triggers.

## Project Structure

```
routemaster/
├── app/
│   ├── (auth)/          → Login, signup, forgot/reset password
│   ├── (dashboard)/     → All authenticated dashboard pages
│   ├── api/             → API routes (Stripe, SMS, geocode, optimize)
│   └── page.tsx         → Public landing page
├── components/
│   ├── dashboard/       → Dashboard-specific components
│   └── ui/              → shadcn/ui components
├── lib/
│   ├── queries/         → TanStack Query hooks for all data fetching
│   ├── ors/             → OpenRouteService helpers (geocode, optimize, directions)
│   ├── sms/             → SMS sender (mock by default, swap for real provider)
│   ├── store/           → Zustand UI state
│   └── supabase/        → Supabase client instances
└── supabase/
    └── migrations/      → Database migrations
```

## Key Architecture Decisions

**Why Next.js API routes instead of a separate backend** — single codebase, zero extra deployment, sufficient for current scale. No Express server needed.

**Why Supabase** — PostgreSQL with Row Level Security means data isolation is enforced at the database level, not just application code. Every user's data is completely isolated by default.

**Why OpenRouteService** — free tier, no credit card required for development, sufficient accuracy for same-city routing. Can be swapped for Google Maps Routes API later with minimal code change (only `lib/ors/` changes).

**Why TanStack Query** — all server state is cached and synchronized automatically. Optimistic updates on deletes make the UI feel instant without complex state management.

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import repository at vercel.com
3. Add all environment variables from `.env.example`
4. Deploy

### Post-Deploy Setup

After deploying, update these three services with your production URL:

**Supabase** → Authentication → URL Configuration:
- Site URL: `https://your-domain.com`
- Redirect URLs: `https://your-domain.com/**`

**Stripe** → Developers → Webhooks:
- Add endpoint: `https://your-domain.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

**Environment Variable**:
- Update `NEXT_PUBLIC_APP_URL` to your production domain

## SMS Configuration

By default, SMS runs in development mode — messages are logged to the console. To enable real delivery:

1. Sign up for Twilio, Vonage, or AWS SNS
2. Add credentials to `.env.local` and Vercel
3. Update `lib/sms/sender.ts` — the file has clear `TODO: TWILIO SWAP` comments showing exactly what to uncomment

## License

MIT