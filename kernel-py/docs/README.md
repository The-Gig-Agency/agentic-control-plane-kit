# Documentation Templates

This directory contains documentation templates that should be customized for your specific kernel.

## Required Documentation

When implementing a kernel with onboarding and billing features, you should create:

1. **TROUBLESHOOTING.md** - Common issues and solutions
2. **API-DOCUMENTATION.md** - Complete API reference with examples
3. **FAQ.md** - Frequently asked questions

## Templates

### TROUBLESHOOTING.md.template
- Generic troubleshooting guide template
- Replace `{KERNEL_NAME}`, `{FREE_TIER_LIMIT}`, and other placeholders
- Add kernel-specific error messages and solutions
- Customize examples for your actions

### API-DOCUMENTATION.md.template
- Generic API documentation template
- Document all actions in your kernel
- Add examples for each action type
- Document field requirements and validation rules

### FAQ.md.template
- Generic FAQ template
- Add kernel-specific questions and answers
- Cover common use cases and edge cases

## Customization Steps

1. **Copy the template** to remove `.template` extension:
   ```bash
   cp docs/TROUBLESHOOTING.md.template docs/TROUBLESHOOTING.md
   cp docs/API-DOCUMENTATION.md.template docs/API-DOCUMENTATION.md
   cp docs/FAQ.md.template docs/FAQ.md
   ```

2. **Replace placeholders:**
   - `{KERNEL_NAME}` → Your kernel name (e.g., "Lead Scoring", "CIQ Automations")
   - `{FREE_TIER_LIMIT}` → Your free tier limit (e.g., 100)
   - `{YOUR_API_URL}` → Your API base URL
   - `{ACTION_NAME}` → Your actual action names
   - `{PRICE_PER_CALL}` → Your pricing (e.g., 0.001)

3. **Add kernel-specific content:**
   - Document your actual actions
   - Add real examples from your kernel
   - Include common errors specific to your domain
   - Add field validation rules for your actions

4. **Link from onboarding response:**
   - Update your onboarding endpoint to reference these docs
   - Include `troubleshooting_url` and `documentation_url` in the response

## Example Customizations

When customizing these templates, you should:
- Replace all `{PLACEHOLDERS}` with your actual values
- Add real examples from your kernel's actions
- Document your specific error messages and solutions
- Include field validation rules for your domain
- Add common use cases and workflows

**Tip:** Look at existing kernel implementations for inspiration, but always customize for your specific kernel's needs.

## Integration with Onboarding

Your onboarding endpoint should reference these docs:

```python
return JsonResponse({
    "onboarded": True,
    "api_key": api_key,
    "tenant_uuid": tenant_uuid,
    "instructions": {
        "documentation_url": f"{base_url}/api-docs",
        "troubleshooting_url": f"{base_url}/troubleshooting",
        # ... other instructions
    }
})
```
