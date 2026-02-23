# Railway Deployment Fix

## Problem

Railway is auto-detecting Node.js and trying to run `npm run build`, which fails because:
- This is a Deno project, not Node.js
- TypeScript compilation fails on Deno-specific imports (`.ts` extensions)
- Test files have type errors

## Solution

Railway needs to use **Docker** instead of the auto-detected Node.js buildpack.

## Steps

1. **In Railway Dashboard:**
   - Go to your service settings
   - Under "Build" section
   - Change from "Nixpacks" (auto-detect) to **"Dockerfile"**
   - Set Dockerfile path: `gateway/Dockerfile`
   - Save

2. **Or use Railway CLI:**
   ```bash
   railway service update --dockerfile gateway/Dockerfile
   ```

3. **Set Environment Variables:**
   ```
   ACP_BASE_URL=https://your-supabase-url.supabase.co
   ACP_KERNEL_KEY=your_kernel_key
   ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
   DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
   PORT=8000
   ```

4. **Redeploy** - Railway will now use Docker instead of trying to build with Node.js

## Why This Works

- Dockerfile uses `denoland/deno:1.40.0` base image
- No TypeScript compilation needed (Deno runs `.ts` directly)
- All Deno features work (subprocess spawning, filesystem access)
- Same Dockerfile works for Railway, Render, ECS, etc.
