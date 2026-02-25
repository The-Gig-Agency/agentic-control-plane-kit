# Echelon MCP Gateway - Consumer Product Guide

**Product:** Echelon MCP Gateway  
**URL:** https://www.buyechelon.com/consumer  
**Status:** Production Ready

---

## What is Echelon MCP Gateway?

**Echelon MCP Gateway** is a hosted, governed proxy service for the Model Context Protocol (MCP). It allows AI agents to safely access tools, resources, prompts, and sampling capabilities while enforcing governance policies.

### Key Features

✅ **Hosted Service** - No installation required, just a URL and API key  
✅ **Policy Enforcement** - Automatic governance and rate limiting  
✅ **Multi-Tenant** - Secure isolation between consumers  
✅ **Audit Logging** - Complete visibility into all operations  
✅ **Tool Aggregation** - Access multiple MCP servers through one gateway  
✅ **Enterprise Security** - API key authentication, CORS protection, input validation  

---

## Who Is This For?

**Perfect for:**
- AI agents that need governed access to MCP tools
- Teams building agentic applications
- Organizations requiring policy enforcement
- Developers who want hosted MCP infrastructure

**Use Cases:**
- AI agents accessing filesystem, databases, APIs
- Multi-agent systems with shared tool access
- Enterprise deployments requiring governance
- SaaS applications with agent capabilities

---

## How It Works

### Architecture

```
Your AI Agent
    ↓
Echelon MCP Gateway (https://gateway.buyechelon.com)
    ↓
Governance Hub (Policy Enforcement)
    ↓
MCP Servers (Tools, Resources, Prompts)
```

### Flow

1. **Agent makes request** → Gateway receives MCP request with API key
2. **Gateway authenticates** → Validates API key, identifies tenant
3. **Gateway authorizes** → Checks policies, rate limits
4. **Gateway forwards to MCP server** → If allowed, executes tool/resource
5. **Gateway returns result** → Agent receives response
6. **Gateway audits** → All actions logged for compliance

---

## Getting Started

### Step 1: Sign Up

**Visit:** https://www.buyechelon.com/consumer

**Or use programmatic signup:**
```http
POST https://www.buyechelon.com/api/consumer/signup
Content-Type: application/json

{
  "email": "your-email@example.com",
  "organization_name": "Your Company",
  "agent_id": "your-agent-id",
  "tenant_slug": "onsite-affiliate"
}
```

**What happens:**
- Agent joins the selected tenant in Governance Hub
- Per-tenant API key generated for your account
- Free tier activated automatically
- Credentials sent to your email

---

### Step 2: Receive Your Credentials

**You'll receive:**
- **API Key:** `mcp_abc123def456...` (keep this secret!)
- **Gateway URL:** `https://gateway.buyechelon.com`
- **Quick Start Guide** (this document)

**Important:** Your API key is shown **only once** during signup. Save it securely!

---

### Step 3: Configure Your MCP Client

**Add to your MCP client configuration:**

```json
{
  "mcpServers": {
    "echelon": {
      "url": "https://gateway.buyechelon.com",
      "headers": {
        "X-API-Key": "mcp_abc123def456..."
      }
    }
  }
}
```

**That's it!** No installation, no dependencies, no environment variables.

---

### Step 4: Use the Gateway

**Make MCP requests:**

```http
POST https://gateway.buyechelon.com/mcp
Content-Type: application/json
X-API-Key: mcp_abc123def456...

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "fs.read_file",
        "description": "Read a file from the filesystem",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          }
        }
      }
    ]
  }
}
```

---

## Supported MCP Operations

### Tools
- `tools/list` - List all available tools
- `tools/call` - Execute a tool (requires authorization)

### Resources
- `resources/list` - List available resources
- `resources/read` - Read a resource
- `resources/write` - Write to a resource (requires authorization)

### Prompts
- `prompts/list` - List available prompts
- `prompts/get` - Get a prompt template

### Sampling
- `sampling/create` - Generate text (requires authorization)

### Discovery
- `meta.discover` - Discover gateway capabilities
- `meta.info` - Get gateway information

---

## Security & Governance

### Authentication

**API Key Required:**
- All requests must include `X-API-Key` header
- API keys are tenant-specific
- Keys can be revoked at any time

**Security Features:**
- ✅ API keys stored as hashes (never plaintext)
- ✅ CORS protection (origin validation)
- ✅ Input validation (request size limits, structure validation)
- ✅ Rate limiting (per tenant)
- ✅ Audit logging (all actions logged)

### Policy Enforcement

**Automatic Governance:**
- Rate limits enforced per tenant
- Action-level authorization
- Resource usage tracking
- Policy-based access control

**Fail-Closed:**
- Authorization failures result in deny
- Network errors fail-closed (security > availability)
- Invalid requests rejected

---

## Pricing Tiers

### Free Tier
- ✅ 1,000 requests/month
- ✅ Basic tools access
- ✅ Standard rate limits
- ✅ Community support

### Pro Tier
- ✅ 10,000 requests/month
- ✅ All tools and resources
- ✅ Higher rate limits
- ✅ Priority support
- ✅ Custom policies

### Enterprise Tier
- ✅ Unlimited requests
- ✅ Custom rate limits
- ✅ Dedicated support
- ✅ SLA guarantees
- ✅ Custom integrations

**Upgrade:** Visit https://www.buyechelon.com/consumer or contact sales@echelon.com

---

## API Reference

### Endpoints

**MCP Endpoint:**
```
POST https://gateway.buyechelon.com/mcp
Headers:
  X-API-Key: mcp_abc123...
  Content-Type: application/json
Body: MCP JSON-RPC 2.0 request
```

**Discovery Endpoint:**
```
GET https://gateway.buyechelon.com/meta.discover
Response: Gateway capabilities and registration info
```

**Health Check:**
```
GET https://gateway.buyechelon.com/health
Response: { "status": "ok" }
```

### Error Codes

**MCP Error Codes:**
- `-32700` - Parse error (invalid JSON)
- `-32602` - Invalid params (validation failed)
- `-32001` - Authorization denied
- `-32002` - Request timeout
- `-32003` - Service unavailable

**HTTP Status Codes:**
- `200` - Success
- `400` - Bad request (validation error)
- `401` - Unauthorized (invalid API key)
- `403` - Forbidden (authorization denied)
- `429` - Too many requests (rate limited)
- `500` - Internal server error

---

## Best Practices

### API Key Security

✅ **Do:**
- Store API keys in environment variables
- Use secrets management (e.g., AWS Secrets Manager)
- Rotate keys periodically
- Use different keys for different environments

❌ **Don't:**
- Commit API keys to version control
- Share keys between team members
- Use keys in client-side code
- Log keys in application logs

### Error Handling

**Always handle errors:**
```typescript
try {
  const response = await fetch('https://gateway.buyechelon.com/mcp', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mcpRequest),
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // Invalid API key
    } else if (response.status === 429) {
      // Rate limited - retry with backoff
    } else {
      // Other error
    }
  }
  
  const result = await response.json();
} catch (error) {
  // Network error
}
```

### Rate Limiting

**Respect rate limits:**
- Implement exponential backoff
- Cache responses when possible
- Batch requests when appropriate
- Monitor rate limit headers

---

## Troubleshooting

### Common Issues

**"Invalid API key"**
- Check that API key is correct
- Ensure `X-API-Key` header is set
- Verify key hasn't been revoked
- Check key hasn't expired

**"Authorization denied"**
- Check your tier allows this action
- Verify rate limits haven't been exceeded
- Check policy restrictions
- Contact support if issue persists

**"Service unavailable"**
- Check gateway status: https://gateway.buyechelon.com/health
- Verify network connectivity
- Retry with exponential backoff
- Check status page for outages

**"Request timeout"**
- Reduce request size
- Check network latency
- Verify MCP server is responding
- Contact support if persistent

---

## Support & Resources

### Documentation
- **Full Documentation:** https://docs.echelon.com
- **API Reference:** https://docs.echelon.com/api
- **Examples:** https://github.com/echelon/examples

### Support
- **Email:** support@echelon.com
- **Community:** https://community.echelon.com
- **Status Page:** https://status.echelon.com

### Getting Help
- Check documentation first
- Search community forums
- Open a support ticket
- Join Discord: https://discord.gg/echelon

---

## FAQ

**Q: Do I need to install anything?**  
A: No! The gateway is fully hosted. Just configure your MCP client with the URL and API key.

**Q: Can I use my own MCP servers?**  
A: Yes! The gateway can proxy to any MCP server. Contact support for custom server configuration.

**Q: How is this different from running MCP locally?**  
A: The gateway adds governance, policy enforcement, audit logging, and multi-tenant isolation. It's production-ready infrastructure.

**Q: What happens if I exceed my rate limit?**  
A: You'll receive a 429 status code. Implement exponential backoff and retry, or upgrade your tier.

**Q: Can I revoke my API key?**  
A: Yes! Visit your dashboard at https://www.buyechelon.com/consumer or contact support.

**Q: Is my data secure?**  
A: Yes! All API keys are hashed, requests are validated, and audit logs are encrypted. See our security documentation.

**Q: Can I use this in production?**  
A: Yes! The gateway is production-ready with high availability, monitoring, and SLA guarantees (Enterprise tier).

---

## Next Steps

1. **Sign up** at https://www.buyechelon.com/consumer
2. **Get your API key** from the welcome email
3. **Configure your MCP client** with the gateway URL
4. **Start making requests** and explore available tools
5. **Upgrade your tier** as needed for higher limits

**Ready to get started?** Visit https://www.buyechelon.com/consumer

---

**Last Updated:** February 2026  
**Version:** 1.0
