# Init / Protect Bootstrap State Machine

Ticket coverage: TGA-161

The installer exposes product-shell lifecycle plans for bootstrapping an ACP instance.
These plans are machine-readable JSON and can be emitted by public CLI verbs with `--json`.

Supported workflows:
- `echelon init` -> scaffold ACP kernel artifacts + readiness gates
- `echelon protect <connector>` -> verify scaffolding from the install trust anchor and block on unresolved critical items

---

## Machine-readable Output

Each workflow plan conforms to the internal `ProductShellWorkflowPlan` shape:

```ts
type ProductShellWorkflowStatus = 'pending' | 'ready' | 'blocked';

type ProductShellWorkflowPlan = {
  workflow: 'login' | 'link' | 'environment' | 'init' | 'protect';
  publicCommand: string;
  status: ProductShellWorkflowStatus;
  summary: string;
  context: { cwd: string; env: 'development'|'staging'|'production'; framework: 'django'|'express'|'supabase'; projectName: string };
  requiresInput: string[];
  nextAction: string;
  output: { projectName: string; framework: 'django'|'express'|'supabase'; env: 'development'|'staging'|'production' };
  steps: Array<{ id: string; label: string; description: string; integrationPoint?: string }>;
};
```

---

## Happy Path vs Failure Path

### `echelon init`

Happy path:
- detect project context successfully
- generate kernel artifacts and write `.acp/install.json` trust anchor
- readiness gate scanner passes (or only produces warnings in development)

Failure path (blocked):
- route collision or production constraints fail preflight
- unresolved critical TODO/placeholder markers detected for production
- CLI must stop and provide explicit next steps (what failed + why it matters + what to do next)

### `echelon protect`

Happy path:
- `.acp/install.json` trust anchor exists
- `doctor` + verification tooling passes for enabled packs
- host app can proceed to migrations/endpoint checks and then exercise `/manage meta.actions`

Failure path (blocked):
- missing `.acp/install.json` -> trust anchor absent -> protect is blocked
- doctor checks fail -> bindings invalid / pack gaps / missing audit adapter
- verifier finds structural issues -> protect must be blocked with guided next steps

---

## Guided Next Actions

The CLI surfaces a `nextAction` string in JSON (and a human summary in non-JSON mode).
This is the explicit contract for “what the operator should do next” after a success or a block.

