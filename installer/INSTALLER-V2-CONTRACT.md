# Installer V2 Contract

This contract defines what the kit must provide out of the box and what each SaaS project must still implement.

Use this to keep onboarding fast while avoiding unsafe "magic" that guesses app-specific models.

---

## Goal

- Reduce time-to-first-working `/api/manage`.
- Eliminate repeated implementation of shared connector logic.
- Keep domain and schema ownership with each SaaS team.
- Provide clear pass/fail readiness before production.

---

## Ownership Boundary

### Kit-Owned (Prebuilt, Required in V2)

These are shared, cross-project capabilities and should be fully implemented in this repo:

- **Installer core**
  - framework detection
  - file generation
  - dry-run + diff preview
  - idempotent re-run behavior
- **Repo B connector adapters**
  - auth/signing
  - policy check calls
  - heartbeat/registration
  - audit forwarding shape
  - retries, timeouts, error mapping
- **Repo C executor adapters**
  - request signing/auth
  - endpoint normalization
  - response normalization + error mapping
- **Safety runtime defaults**
  - `ACP_ENABLED` gate
  - `ACP_FAIL_MODE` behavior (`open`, `closed`, `read-open`)
  - governance outage handling
- **Validation tooling**
  - post-install readiness report
  - blocker detection for unresolved TODO markers
  - framework-specific health checks

### Project-Owned (Must Be Implemented Per SaaS)

These depend on each app's models, permissions, and business logic:

- **Tenant resolution**
  - map API key identity to tenant
- **Local audit storage** (if used)
  - write to project audit model/table
- **Rate limiting + ceilings policy wiring**
  - map limits to tenant plans/features
- **Domain packs**
  - actions + handlers for real product operations
- **Schema mapping**
  - actual table/model names for tenant/auth/audit
- **Migration integration**
  - migration dependency chain + app labels

---

## V2 Deliverables (What "Done" Means)

Installer v2 is complete only when all are true:

- `install --framework <x>` generates a runnable endpoint without syntax errors.
- Repo B/Repo C connectors run without local edits in generated code.
- Generated code has no `TODO`, `your_app`, or placeholder identifiers in required runtime paths.
- Installer prints a machine-readable readiness report.
- Readiness report blocks production mode if critical items are unresolved.

---

## Readiness Gates

### Gate A: Generated Artifact Integrity (Hard Fail)

- No unresolved markers in runtime files:
  - `TODO:`
  - `NotImplementedError`
  - `your_app`
  - `XXXX_previous_migration`
- Endpoint route is wired and importable by framework runtime.
- Bindings parse and include required keys.

### Gate B: Connector Health (Hard Fail for Production)

- Repo B adapter can:
  - construct signed/authenticated request
  - execute health/policy check
  - map failures to standard error codes
- Repo C adapter can:
  - construct signed/authenticated request
  - execute sample action in dry-run mode
  - return normalized response shape

### Gate C: Project Integration Completeness (Soft Fail in Dev, Hard Fail in Prod)

- Tenant resolution implemented and tested.
- Audit write path implemented (local or Repo B-only, explicitly configured).
- Domain pack has at least one non-meta action with schema + handler.
- Migrations are linked to project migration graph.

---

## Installer Output Contract

`install` should end with a summary like:

- **ready_for_dev:** true/false
- **ready_for_prod:** true/false
- **blocking_items:** list of unresolved critical tasks
- **recommended_items:** list of non-critical improvements
- **files_generated:** list
- **verification_commands:** list of exact commands to run

For CI usage, expose `--report-json` that writes this to disk.

---

## Generated File Policy

- Runtime-critical generated files must be production-safe defaults.
- If app-specific code is required, generate explicit stubs that:
  - fail fast with clear error messages
  - include one concrete implementation example
  - are detected by readiness checks until resolved
- Never silently swallow connector/auth failures.

---

## Framework-Specific Minimums

### Django

- Generated endpoint is importable in Django startup.
- URL route insertion is idempotent and collision-safe.
- Adapter classes compile and run under current Python version.
- Migration templates require explicit dependency resolution before prod readiness.

### Express

- Route handler compiles with project TypeScript config.
- Async adapter methods return normalized ACP response objects.

### Supabase

- Edge function compiles in Deno runtime.
- Environment keys are validated at cold start with clear messages.

---

## Developer Experience Requirements

- `install --dry-run` shows all planned changes.
- `install --migrations-only` and `--no-migrations` are supported.
- `verify-install` command validates readiness gates independently.
- Error messages must include:
  - what failed
  - why it matters
  - exact next action

---

## Security Baseline

- No plaintext secrets written into generated files.
- Env variable names are documented and validated.
- Connector requests include bounded timeout and retry strategy.
- Governance failure behavior is explicit and auditable.

---

## Recommended Rollout Plan

- **Phase 1:** fully prebuild Repo B/Repo C connectors and install report.
- **Phase 2:** enforce gate A by default; gate C as warning in development.
- **Phase 3:** enforce gate B/C for `--env production`.
- **Phase 4:** publish reference apps (Django, Express, Supabase) as golden templates.

---

## Implementation Checklist (Copy/Paste)

- [ ] Define critical runtime files for each framework.
- [ ] Add unresolved-marker scanner (`TODO`, placeholders, app tokens).
- [ ] Add `--report-json` output.
- [ ] Add `verify-install` command.
- [ ] Prebuild Repo B adapter end-to-end (auth, retries, errors, tests).
- [ ] Prebuild Repo C adapter end-to-end (auth, retries, errors, tests).
- [ ] Add per-framework smoke tests in CI.
- [ ] Add production gate behavior for unresolved critical items.
- [ ] Publish one reference implementation per framework.
- [ ] Document "project-owned" tasks in generated README output.

---

## Non-Goals

- Inferring or mutating proprietary business schema automatically.
- Auto-generating domain actions for product logic.
- Hiding unresolved project-specific work behind weak defaults.
