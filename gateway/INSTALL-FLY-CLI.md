# How to Install Fly CLI

**Platform:** macOS (your system)

---

## Method 1: Install Script (Recommended)

```bash
# Run install script
curl -L https://fly.io/install.sh | sh

# Add to PATH (if not automatically added)
export FLYCTL_INSTALL="/Users/$USER/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

# Verify installation
fly version
```

**Note:** The install script automatically adds Fly to your PATH. You may need to restart your terminal or run the export commands above.

---

## Method 2: Homebrew (Alternative)

```bash
# Install via Homebrew
brew install flyctl

# Verify installation
fly version
```

---

## Method 3: Manual Installation

```bash
# Download binary
curl -L https://fly.io/install.sh | sh

# Or download directly
# macOS (Intel)
curl -L https://github.com/superfly/flyctl/releases/latest/download/flyctl_darwin_amd64.tar.gz -o flyctl.tar.gz

# macOS (Apple Silicon/M1/M2)
curl -L https://github.com/superfly/flyctl/releases/latest/download/flyctl_darwin_arm64.tar.gz -o flyctl.tar.gz

# Extract
tar -xzf flyctl.tar.gz

# Move to PATH
sudo mv flyctl /usr/local/bin/fly

# Verify
fly version
```

---

## After Installation

### 1. Login to Fly.io

```bash
fly auth login
```

This will open a browser for authentication.

### 2. Verify Installation

```bash
# Check version
fly version

# Check you're logged in
fly auth whoami

# List apps (should be empty initially)
fly apps list
```

---

## Troubleshooting

### Issue: "fly: command not found"

**Fix:**
```bash
# Add to PATH manually
export FLYCTL_INSTALL="/Users/$USER/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

# Or add to ~/.zshrc (for permanent fix)
echo 'export FLYCTL_INSTALL="/Users/$USER/.fly"' >> ~/.zshrc
echo 'export PATH="$FLYCTL_INSTALL/bin:$PATH"' >> ~/.zshrc

# Reload shell
source ~/.zshrc

# Verify
fly version
```

### Issue: "Permission denied"

**Fix:**
```bash
# Make executable
chmod +x ~/.fly/bin/fly

# Or if installed elsewhere
chmod +x /usr/local/bin/fly
```

---

## Quick Start After Installation

```bash
# 1. Login
fly auth login

# 2. Navigate to gateway directory
cd gateway

# 3. Initialize app (if not done)
fly launch --no-deploy

# 4. Set secrets
fly secrets set ACP_BASE_URL=https://your-hub.supabase.co
fly secrets set ACP_KERNEL_KEY=your_key

# 5. Deploy
fly deploy
```

---

**Last Updated:** February 2026
