# Push Documentation Cleanup Commands

**Date:** February 23, 2026  
**Purpose:** Push documentation cleanup to all three repos

---

## Repo A (agentic-control-plane-kit)

```bash
cd /Users/rastakit/tga-workspace/repos/agentic-control-plane-kit

# Check status
git status

# Add all changes (deletions and updates)
git add -A

# Commit
git commit -m "Clean up documentation across repos

- Delete 47 outdated/temporary files (Vercel, Fly.io, troubleshooting)
- Update README.md with comprehensive documentation index
- Add canonical references to THREE-REPO-CANONICAL-MODEL.md
- Consolidate MCP Gateway documentation
- Remove duplicate and temporary implementation summaries
- Ensure consistency across all three repos"

# Push
git push origin main
```

---

## Repo B (governance-hub)

```bash
cd /Users/rastakit/tga-workspace/repos/governance-hub

# Pull first (in case of remote changes)
git pull origin main --no-rebase

# Check status
git status

# Add changes (deleted duplicate, updated README)
git add -A

# Commit
git commit -m "Clean up documentation

- Delete duplicate MCP-GATEWAY-SUMMARY.md (canonical version in Repo A)
- Update README.md with reference to THREE-REPO-CANONICAL-MODEL.md
- Add reference to MCP Gateway docs in Repo A
- Ensure consistency with Repo A documentation"

# Push
git push origin main
```

---

## Repo C (key-vault-executor)

```bash
cd /Users/rastakit/tga-workspace/repos/key-vault-executor

# Pull first (in case of remote changes)
git pull origin main --no-rebase

# Check status
git status

# Add changes (deleted duplicate, updated README)
git add -A

# Commit
git commit -m "Clean up documentation

- Delete duplicate MCP-GATEWAY-SUMMARY.md (canonical version in Repo A)
- Update README.md with references to canonical docs
- Add reference to THREE-REPO-CANONICAL-MODEL.md (Repo A)
- Add reference to INTERNAL-ENDPOINTS-SECURITY.md (Repo A)
- Ensure consistency with Repo A documentation"

# Push
git push origin main
```

---

## Summary

**Files Changed:**
- **Repo A:** 47 files deleted, README.md updated
- **Repo B:** 1 file deleted, README.md updated
- **Repo C:** 1 file deleted, README.md updated

**Total:** 49 files deleted, 3 README files updated

**Result:** Clean, consistent documentation across all three repos with canonical references.
