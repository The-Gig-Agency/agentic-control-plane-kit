# Worker / background services (out of band)

Real hybrid SaaS repos often run **Python, Node, or Go workers** that share the same Supabase database and auth model as the Netlify-served web tier.

Echelon’s **manage** API is generated under **Netlify Functions** for this template. Workers do not host `/manage` unless you intentionally add a second entrypoint.

Use this folder in your fork to document or place worker code; the golden template leaves it empty so `echelon init` stays deterministic.
