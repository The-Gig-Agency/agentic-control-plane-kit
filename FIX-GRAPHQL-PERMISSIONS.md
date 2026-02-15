# Fixing GraphQL "Could Not Resolve" When Repo Has Content

## The Issue

Repo has content ✅, but GraphQL can't resolve it. This is a **token permissions** or **authentication** issue.

## Solution 1: Token Needs `read:org` Scope

GraphQL queries for org repos require additional scopes:

1. Go to: https://github.com/settings/tokens (as `acedge123`)
2. Find your token (or create new one)
3. **Required scopes:**
   - ✅ `repo` (Full control of private repositories)
   - ✅ `read:org` (Read org and team membership)
4. Update token or create new one with these scopes
5. Use the new token on your agent machine

## Solution 2: Re-authenticate GitHub CLI

If using `gh` CLI:

```bash
# On agent machine
gh auth logout
gh auth login
# Select: GitHub.com → HTTPS → "Paste an authentication token"
# Paste token with repo + read:org scopes

# Test GraphQL access
gh api graphql -f query='
  query {
    repository(owner: "The-Gig-Agency", name: "agentic-control-plane-kit") {
      name
      description
    }
  }
'
```

## Solution 3: Test GraphQL Directly

Test if your token works with GraphQL:

```bash
# Replace YOUR_TOKEN with your token
curl -X POST \
  -H "Authorization: bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { repository(owner: \"The-Gig-Agency\", name: \"agentic-control-plane-kit\") { name } }"}' \
  https://api.github.com/graphql
```

**If this fails:**
- Token doesn't have `read:org` scope
- Or token is invalid/expired

**If this works:**
- Token is fine, issue is with how your agent is using it

## Solution 4: Use REST API Instead

If GraphQL keeps failing, use REST API (simpler, fewer permission issues):

```bash
# REST API works with just 'repo' scope
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/repos/The-Gig-Agency/agentic-control-plane-kit

# Or with GitHub CLI
gh api repos/The-Gig-Agency/agentic-control-plane-kit
```

## Solution 5: Check Token on Agent Machine

Verify the agent machine is using the right token:

```bash
# If using GitHub CLI
gh auth status
# Should show: acedge123 logged in

# Check token scopes
gh api user
# Should return your user info

# Test repo access
gh repo view The-Gig-Agency/agentic-control-plane-kit
# Should work if token has 'repo' scope
```

## Most Likely Fix

**Create a new token with both scopes:**

1. Go to: https://github.com/settings/tokens (as `acedge123`)
2. Click "Generate new token (classic)"
3. Name: `agent-machine-graphql`
4. Scopes:
   - ✅ `repo` 
   - ✅ `read:org`
5. Generate and copy token
6. Use this token on agent machine

**Then re-authenticate:**
```bash
gh auth login
# Paste the new token
```

## Quick Test

Run this to verify everything works:

```bash
# Test REST API (should work with just 'repo')
gh api repos/The-Gig-Agency/agentic-control-plane-kit

# Test GraphQL (needs 'read:org' too)
gh api graphql -f query='query { repository(owner: "The-Gig-Agency", name: "agentic-control-plane-kit") { name } }'

# Test clone (should work)
gh repo clone The-Gig-Agency/agentic-control-plane-kit
```

If REST works but GraphQL doesn't → you need `read:org` scope.
