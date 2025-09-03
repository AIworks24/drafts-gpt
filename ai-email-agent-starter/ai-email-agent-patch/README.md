# AI Email Agent Expansion

## New Components
- Microsoft OAuth handler
- Graph webhook + draft API
- Supabase integration
- Worker jobs for sync + draft generation

## Setup
1. Copy `.env.example` → `.env` and fill in values.
2. Run Supabase migration: `psql $DATABASE_URL -f supabase/migrations/01_init.sql`
3. Start web app: `pnpm dev`
4. Start worker: `pnpm worker:start`
