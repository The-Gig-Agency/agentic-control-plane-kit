# Installer Validation Tests

## Quick Start

```bash
# From repo root
npm run validate:installer
```

## Prerequisites

- Node.js installed
- `tsx` available (install with `npm install -g tsx` or use `npx tsx`)
- Installer code must exist in `installer/` directory

## What Gets Tested

### Automated Tests (`validate-installer.sh`)

1. **Prerequisites Check**
   - Verifies installer CLI exists
   - Checks for `tsx` or `npx`

2. **Framework Detection**
   - Tests Django detection
   - Tests Express detection
   - Verifies auto-detection works

3. **File Generation**
   - Tests Django file generation
   - Tests Express file generation
   - Verifies all required files are created

4. **Uninstall**
   - Tests uninstall functionality
   - Verifies clean removal

5. **Doctor Command**
   - Tests health check command
   - Verifies it reports installation status

6. **Error Handling**
   - Tests graceful failure in invalid directories
   - Verifies error messages are clear

## Manual Tests

See `validate-manual.md` for detailed manual test procedures.

## Troubleshooting

### "tsx not found"
```bash
npm install -g tsx
# Or use npx (the script will auto-detect)
```

### "Installer CLI not found"
Make sure you're running from the repo root and the installer code exists.

### Tests fail but installer works
The validation script is strict. If manual tests pass but automated tests fail, check:
- Output format might have changed
- File paths might be different
- Framework detection logic might have changed

## Running Specific Framework Tests

```bash
npm run validate:installer:django
npm run validate:installer:express
npm run validate:installer:supabase
```

## Test Environment

Tests create temporary projects in `installer/test/test-projects/` which are automatically cleaned up after tests run.
