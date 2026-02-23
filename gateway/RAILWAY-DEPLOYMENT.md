# Railway Deployment Guide

## Quick Start

1. **Sign up at Railway** (https://railway.app)
2. **Connect GitHub repo** (The-Gig-Agency/agentic-control-plane-kit)
3. **Create new project** → Deploy from GitHub repo
4. **IMPORTANT: Configure Docker Deployment**
   - Railway will auto-detect Node.js (wrong!)
   - Go to Service Settings → Build
   - Change from "Nixpacks" to **"Dockerfile"**
   - Set Dockerfile path: `gateway/Dockerfile`
   - Root directory: Leave empty (deploys from root)
   - Build command: (leave empty, Docker handles it)
   - Start command: (leave empty, Docker CMD handles it)
   
   **OR** Railway should auto-detect `railway.json` in the repo root (already created)

5. **Set Environment Variables:**
   ```
   ACP_BASE_URL=https://your-supabase-url.supabase.co
   ACP_KERNEL_KEY=your_kernel_key
   ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
   DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
   PORT=8000
   ```

6. **Deploy** - Railway will automatically build and deploy

## Advantages Over Fly.io

- ✅ Simpler Docker deployment
- ✅ Better error messages
- ✅ Automatic HTTPS
- ✅ Easy environment variable management
- ✅ Better Deno support
- ✅ No complex entrypoint issues

## Custom Domain

Railway provides a default domain, but you can add:
- `gateway.buyechelon.com` via Railway's custom domain feature

## Monitoring

- Railway dashboard shows logs in real-time
- Better error visibility than Fly.io
- Automatic restarts on crashes

## Cost

- Railway has a free tier with $5 credit/month
- Pay-as-you-go after that
- Usually cheaper than Fly.io for this use case
