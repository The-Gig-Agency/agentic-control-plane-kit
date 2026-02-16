# Repo B Migration Guide

## Step 1: Clone the New Repo

```bash
cd /Users/rastakit/tga-workspace/repos
git clone https://github.com/The-Gig-Agency/governance-hub.git
cd governance-hub
```

## Step 2: Files to Copy from Repo A

### Documentation Files

Copy these from `agentic-control-plane-kit/docs/marketing/` to `governance-hub/docs/`:

1. **GOVERNANCE-PORTAL-SUMMARY.md** - Main consolidated spec
2. **PLATFORM-BUILD-PLAN.md** - Detailed technical plan
3. **KERNEL-TO-PLATFORM-EVOLUTION.md** - Evolution strategy
4. **REPO-SEPARATION-STRATEGY.md** - Two-repo model
5. **STRATEGIC-INSIGHT.md** - Authoritative model
6. **VALUE-PROPOSITION.md** - Value prop

### Database Schema

Create `governance-hub/supabase/migrations/001_initial_schema.sql` with the schema from GOVERNANCE-PORTAL-SUMMARY.md

### Backend Structure to Create

```
governance-hub/
├── supabase/
│   ├── functions/
│   │   ├── authorize/
│   │   ├── audit-ingest/
│   │   ├── audit-query/
│   │   ├── revoke/
│   │   ├── revocations-snapshot/
│   │   └── heartbeat/
│   └── migrations/
│       └── 001_initial_schema.sql
└── lib/
    ├── policy-engine.ts
    ├── policy-cache.ts
    ├── authorization.ts
    └── audit-service.ts
```

## Step 3: What Cursor Will Build

1. Database migrations (from schema in summary doc)
2. Supabase Edge Functions (6 functions)
3. Shared backend logic (policy engine, cache, etc.)

## Step 4: Integration Points

- Frontend (Lovable) calls Supabase Edge Functions via `fetch()`
- Edge Functions use shared `lib/` code
- Database schema supports all features from summary doc
