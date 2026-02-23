# AWS Subdomain Setup Guide - gateway.buyechelon.com

**Subdomain:** `gateway.buyechelon.com`  
**Purpose:** MCP Gateway HTTP Service  
**AWS Services:** Route 53, CloudFront, ACM, Lambda/EC2/ECS

---

## Prerequisites

- ✅ AWS Account with appropriate permissions
- ✅ Domain `buyechelon.com` registered (can be in Route 53 or external)
- ✅ Gateway service ready to deploy (Deno/Node.js service)

---

## Option 1: Route 53 + CloudFront + Lambda (Recommended for Serverless)

**Best for:** Serverless Deno/Node.js gateway  
**Cost:** Pay-per-request, auto-scaling  
**SSL:** Automatic via CloudFront

### Step 1: Request SSL Certificate in ACM

1. **Go to AWS Certificate Manager (ACM)**
   - Console → Certificate Manager
   - Region: **US East (N. Virginia)** - Required for CloudFront
   - Click "Request certificate"

2. **Request Public Certificate**
   - Domain name: `gateway.buyechelon.com`
   - Validation method: DNS validation (recommended)
   - Click "Request"

3. **Validate Certificate**
   - ACM will provide CNAME records
   - Add these to Route 53 (or your DNS provider)
   - Wait for validation (usually 5-30 minutes)

**CNAME Records Example:**
```
Type: CNAME
Name: _abc123.gateway.buyechelon.com
Value: _xyz789.acm-validations.aws.
```

### Step 2: Deploy Gateway to Lambda

**Option A: Deno Deploy (Easiest)**

If using Deno Deploy, skip Lambda and go to Step 3 (CloudFront).

**Option B: AWS Lambda Function**

1. **Create Lambda Function**
   ```bash
   # Package your gateway code
   cd gateway
   zip -r gateway.zip http-server.ts *.ts
   ```

2. **Create Lambda via Console:**
   - Console → Lambda → Create function
   - Runtime: **Node.js 20.x** (or **Custom runtime** for Deno)
   - Architecture: x86_64
   - Create function

3. **Upload Code:**
   - Upload `gateway.zip` or use AWS SAM/Serverless Framework
   - Set handler: `http-server.handler` (adjust based on your code)

4. **Configure Environment Variables:**
   ```bash
   ACP_BASE_URL=https://your-governance-hub.supabase.co
   ACP_KERNEL_KEY=your_kernel_api_key
   ALLOWED_ORIGINS=https://www.buyechelon.com,https://buyechelon.com
   DEFAULT_CORS_ORIGIN=https://www.buyechelon.com
   PORT=8000
   ```

5. **Set Function URL (Optional):**
   - Configuration → Function URL
   - Create function URL
   - Auth type: NONE (or AWS_IAM for security)
   - Copy the URL (e.g., `https://abc123.lambda-url.us-east-1.on.aws/`)

### Step 3: Create CloudFront Distribution

1. **Go to CloudFront Console**
   - Console → CloudFront → Create distribution

2. **Origin Settings:**
   - **Origin domain:**
     - If Lambda: Use Function URL
     - If Deno Deploy: Use Deno Deploy URL
     - If EC2/ALB: Use ALB DNS name
   - **Origin path:** Leave empty
   - **Name:** `gateway-origin`

3. **Default Cache Behavior:**
   - **Viewer protocol policy:** Redirect HTTP to HTTPS
   - **Allowed HTTP methods:** GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
   - **Cache policy:** CachingDisabled (for API gateway)
   - **Origin request policy:** AllViewer (forward all headers)

4. **Distribution Settings:**
   - **Alternate domain names (CNAMEs):** `gateway.buyechelon.com`
   - **SSL certificate:** Select the ACM certificate from Step 1
   - **Default root object:** Leave empty
   - **Price class:** Use all edge locations (or cheapest for testing)

5. **Create Distribution**
   - Click "Create distribution"
   - Wait for deployment (5-15 minutes)
   - Copy **Distribution domain name** (e.g., `d1234567890.cloudfront.net`)

### Step 4: Configure Route 53 DNS

**If your domain is in Route 53:**

1. **Go to Route 53 Console**
   - Console → Route 53 → Hosted zones
   - Select `buyechelon.com` hosted zone

2. **Create Record:**
   - Click "Create record"
   - **Record name:** `gateway`
   - **Record type:** A (or AAAA for IPv6)
   - **Alias:** Yes
   - **Alias target:** CloudFront distribution
   - **Route traffic to:** Alias to CloudFront distribution
   - **Distribution:** Select your CloudFront distribution
   - **Evaluate target health:** No
   - Click "Create records"

**If your domain is NOT in Route 53:**

1. **Get CloudFront Distribution Domain:**
   - Copy the CloudFront domain (e.g., `d1234567890.cloudfront.net`)

2. **Add CNAME in Your DNS Provider:**
   ```
   Type: CNAME
   Name: gateway
   Value: d1234567890.cloudfront.net
   TTL: 3600
   ```

### Step 5: Verify Setup

```bash
# Test DNS resolution
dig gateway.buyechelon.com
nslookup gateway.buyechelon.com

# Test HTTPS
curl -I https://gateway.buyechelon.com/health

# Test discovery endpoint
curl https://gateway.buyechelon.com/meta.discover
```

**Expected Response:**
```json
{
  "gateway": {
    "name": "Echelon MCP Gateway",
    "url": "https://gateway.buyechelon.com",
    "registration_required": true,
    "registration_url": "https://www.buyechelon.com/consumer"
  }
}
```

---

## Option 2: Route 53 + Application Load Balancer + ECS/EC2

**Best for:** Containerized gateway or EC2 deployment  
**Cost:** Fixed cost for ALB + EC2/ECS  
**SSL:** Automatic via ALB

### Step 1: Request SSL Certificate in ACM

1. **Go to AWS Certificate Manager**
   - Region: **Your target region** (e.g., us-east-1)
   - Request certificate for `gateway.buyechelon.com`
   - Validate via DNS

### Step 2: Create Application Load Balancer

1. **Go to EC2 Console → Load Balancers**
   - Create Application Load Balancer
   - **Name:** `gateway-alb`
   - **Scheme:** Internet-facing
   - **IP address type:** IPv4
   - **VPC:** Select your VPC
   - **Subnets:** Select at least 2 public subnets

2. **Security Groups:**
   - Create new security group or use existing
   - **Inbound rules:**
     - Type: HTTPS, Port: 443, Source: 0.0.0.0/0
     - Type: HTTP, Port: 80, Source: 0.0.0.0/0 (redirect to HTTPS)

3. **Listeners:**
   - **HTTPS (443):**
     - Default action: Forward to target group
     - Certificate: Select ACM certificate
   - **HTTP (80):**
     - Default action: Redirect to HTTPS

4. **Target Group:**
   - Create target group: `gateway-targets`
   - **Target type:** Instances or IP addresses
   - **Protocol:** HTTP
   - **Port:** 8000 (or your gateway port)
   - **Health check path:** `/health`

5. **Create Load Balancer**
   - Copy **DNS name** (e.g., `gateway-alb-123456789.us-east-1.elb.amazonaws.com`)

### Step 3: Deploy Gateway to ECS/EC2

**Option A: ECS (Container)**

1. **Create ECS Task Definition:**
   ```json
   {
     "family": "gateway",
     "containerDefinitions": [{
       "name": "gateway",
       "image": "your-registry/gateway:latest",
       "portMappings": [{
         "containerPort": 8000,
         "protocol": "tcp"
       }],
       "environment": [
         {"name": "PORT", "value": "8000"},
         {"name": "ACP_BASE_URL", "value": "..."},
         {"name": "ACP_KERNEL_KEY", "value": "..."}
       ]
     }]
   }
   ```

2. **Create ECS Service:**
   - Service type: Fargate or EC2
   - Task definition: `gateway`
   - Cluster: Your cluster
   - Service name: `gateway-service`
   - Load balancer: Attach to ALB target group

**Option B: EC2 Instance**

1. **Launch EC2 Instance:**
   - AMI: Amazon Linux 2 or Ubuntu
   - Instance type: t3.micro (for testing) or t3.small (production)
   - Security group: Allow HTTP (8000) from ALB security group

2. **Install and Run Gateway:**
   ```bash
   # SSH into instance
   ssh ec2-user@your-instance-ip

   # Install Deno (if using Deno)
   curl -fsSL https://deno.land/install.sh | sh

   # Clone and run gateway
   git clone your-repo
   cd gateway
   deno run --allow-net --allow-env http-server.ts
   ```

3. **Register with Target Group:**
   - EC2 Console → Target Groups → `gateway-targets`
   - Register targets → Select your EC2 instance
   - Port: 8000

### Step 4: Configure Route 53 DNS

1. **Go to Route 53 → Hosted Zones**
   - Select `buyechelon.com`
   - Create record:
     - **Name:** `gateway`
     - **Type:** A (Alias)
     - **Alias target:** Application Load Balancer
     - **Region:** Your region
     - **Load balancer:** Select your ALB
     - Create

### Step 5: Verify Setup

```bash
# Test DNS
dig gateway.buyechelon.com

# Test HTTPS
curl https://gateway.buyechelon.com/health

# Test MCP endpoint
curl -X POST https://gateway.buyechelon.com/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Option 3: Route 53 + API Gateway (For REST API)

**Best for:** REST API gateway (if converting MCP to REST)  
**Cost:** Pay-per-request  
**SSL:** Automatic

### Step 1: Create API Gateway

1. **Go to API Gateway Console**
   - Create API → REST API
   - **Name:** `gateway-api`
   - **Endpoint type:** Regional

2. **Create Resources:**
   - `/mcp` (POST)
   - `/meta.discover` (GET)
   - `/health` (GET)

3. **Create Methods:**
   - For each resource, create method
   - Integration type: Lambda function or HTTP
   - Deploy API to stage: `prod`

4. **Custom Domain:**
   - Custom domain names → Create
   - **Domain name:** `gateway.buyechelon.com`
   - **Certificate:** Select ACM certificate
   - **Endpoint configuration:** Regional
   - Create

5. **API Mapping:**
   - Add base path mapping
   - API: `gateway-api`
   - Stage: `prod`
   - Path: (empty)

### Step 2: Configure Route 53

1. **Get API Gateway Domain:**
   - Copy the API Gateway domain name

2. **Create Route 53 Record:**
   - Type: A (Alias)
   - Alias target: API Gateway domain
   - Create

---

## Quick Setup Checklist

### DNS Configuration (Route 53)

- [ ] Domain `buyechelon.com` in Route 53 (or external DNS)
- [ ] SSL certificate requested in ACM
- [ ] SSL certificate validated (CNAME records added)
- [ ] Route 53 record created: `gateway` → CloudFront/ALB/API Gateway

### Gateway Deployment

- [ ] Gateway service deployed (Lambda/ECS/EC2)
- [ ] Environment variables configured
- [ ] Health check endpoint working (`/health`)
- [ ] Discovery endpoint working (`/meta.discover`)

### SSL/TLS

- [ ] SSL certificate issued and validated
- [ ] HTTPS working (`https://gateway.buyechelon.com`)
- [ ] HTTP redirects to HTTPS

### Testing

- [ ] DNS resolves: `dig gateway.buyechelon.com`
- [ ] Health check: `curl https://gateway.buyechelon.com/health`
- [ ] Discovery: `curl https://gateway.buyechelon.com/meta.discover`
- [ ] MCP endpoint: `curl -X POST https://gateway.buyechelon.com/mcp ...`

---

## AWS CLI Commands (Alternative to Console)

### Create Route 53 Record

```bash
# Get hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name buyechelon.com \
  --query 'HostedZones[0].Id' \
  --output text | cut -d'/' -f3)

# Get CloudFront distribution ID
DISTRIBUTION_ID="E1234567890ABC"

# Get CloudFront domain
CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution \
  --id $DISTRIBUTION_ID \
  --query 'Distribution.DomainName' \
  --output text)

# Create Route 53 record
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "gateway.buyechelon.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "'$CLOUDFRONT_DOMAIN'",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

### Request ACM Certificate

```bash
# Request certificate
aws acm request-certificate \
  --domain-name gateway.buyechelon.com \
  --validation-method DNS \
  --region us-east-1

# Get validation records
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:123456789012:certificate/abc123 \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

---

## Cost Estimates

### Option 1: CloudFront + Lambda
- **CloudFront:** $0.085/GB data transfer out
- **Lambda:** $0.20 per 1M requests
- **Route 53:** $0.50/month per hosted zone
- **ACM:** Free
- **Estimated:** $5-20/month for low traffic

### Option 2: ALB + ECS/EC2
- **ALB:** $0.0225/hour (~$16/month)
- **EC2:** t3.micro = $7.50/month, t3.small = $15/month
- **Route 53:** $0.50/month
- **ACM:** Free
- **Estimated:** $24-32/month

### Option 3: API Gateway
- **API Gateway:** $3.50 per million requests
- **Route 53:** $0.50/month
- **ACM:** Free
- **Estimated:** $4-10/month for low traffic

---

## Troubleshooting

### DNS Not Resolving

**Issue:** `gateway.buyechelon.com` doesn't resolve

**Solutions:**
1. Check Route 53 record exists and is correct
2. Wait for DNS propagation (up to 48 hours)
3. Verify CloudFront/ALB is deployed and active
4. Test with different DNS server: `dig @8.8.8.8 gateway.buyechelon.com`

### SSL Certificate Issues

**Issue:** HTTPS not working, certificate errors

**Solutions:**
1. Verify certificate is validated in ACM
2. Check certificate is attached to CloudFront/ALB
3. Verify Route 53 record points to correct target
4. Wait for CloudFront deployment (can take 15-30 minutes)

### 502/503 Errors

**Issue:** Gateway returns 502 Bad Gateway or 503 Service Unavailable

**Solutions:**
1. Check Lambda function is deployed and working
2. Check ECS/EC2 instances are healthy
3. Verify target group health checks are passing
4. Check security groups allow traffic
5. Review CloudWatch logs for errors

### CORS Errors

**Issue:** Browser shows CORS errors

**Solutions:**
1. Verify `ALLOWED_ORIGINS` includes your domain
2. Check CloudFront/ALB forwards `Origin` header
3. Verify gateway returns correct CORS headers
4. Test with `curl` to isolate browser vs server issue

---

## Next Steps

1. ✅ Choose deployment option (CloudFront + Lambda recommended)
2. ✅ Request SSL certificate in ACM
3. ✅ Deploy gateway service
4. ✅ Create CloudFront distribution or ALB
5. ✅ Configure Route 53 DNS record
6. ✅ Test DNS resolution and HTTPS
7. ✅ Update environment variables with actual URLs
8. ✅ Test end-to-end with API key

---

**Last Updated:** February 2026  
**Status:** Ready for AWS Deployment
