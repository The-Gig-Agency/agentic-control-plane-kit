# ECS + Fargate Deployment Guide - MCP Gateway

**Platform:** AWS ECS (Fargate)  
**Service:** MCP Gateway  
**Domain:** `gateway.buyechelon.com`

---

## Prerequisites

- ✅ AWS Account with appropriate permissions
- ✅ AWS CLI installed and configured
- ✅ Docker installed locally
- ✅ ECR repository created
- ✅ Route 53 hosted zone for `buyechelon.com`

---

## Step 1: Create ECR Repository

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name mcp-gateway \
  --region us-east-1

# Get login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Get repository URI
ECR_REPO=$(aws ecr describe-repositories \
  --repository-names mcp-gateway \
  --region us-east-1 \
  --query 'repositories[0].repositoryUri' \
  --output text)

echo "ECR Repository: $ECR_REPO"
```

---

## Step 2: Build and Push Docker Image

```bash
cd gateway

# Build image
docker build -t mcp-gateway:latest .

# Tag for ECR
docker tag mcp-gateway:latest $ECR_REPO:latest

# Push to ECR
docker push $ECR_REPO:latest
```

---

## Step 3: Create CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/mcp-gateway \
  --region us-east-1
```

---

## Step 4: Store Secrets in Secrets Manager

```bash
# Store ACP_BASE_URL
aws secretsmanager create-secret \
  --name gateway/acp-base-url \
  --secret-string "https://your-governance-hub.supabase.co" \
  --region us-east-1

# Store ACP_KERNEL_KEY
aws secretsmanager create-secret \
  --name gateway/kernel-key \
  --secret-string "your_kernel_api_key_here" \
  --region us-east-1

# Store ALLOWED_ORIGINS
aws secretsmanager create-secret \
  --name gateway/allowed-origins \
  --secret-string "https://www.buyechelon.com,https://buyechelon.com" \
  --region us-east-1

# Store DEFAULT_CORS_ORIGIN
aws secretsmanager create-secret \
  --name gateway/cors-origin \
  --secret-string "https://www.buyechelon.com" \
  --region us-east-1
```

---

## Step 5: Create ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name mcp-gateway-cluster \
  --region us-east-1
```

---

## Step 6: Create VPC and Networking (If Not Exists)

```bash
# Create VPC
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --query 'Vpc.VpcId' \
  --output text)

# Create Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
  --query 'InternetGateway.InternetGatewayId' \
  --output text)

aws ec2 attach-internet-gateway \
  --vpc-id $VPC_ID \
  --internet-gateway-id $IGW_ID

# Create Public Subnets (2 for high availability)
SUBNET_1=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --query 'Subnet.SubnetId' \
  --output text)

SUBNET_2=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --query 'Subnet.SubnetId' \
  --output text)

# Create Security Group
SG_ID=$(aws ec2 create-security-group \
  --group-name mcp-gateway-sg \
  --description "Security group for MCP Gateway" \
  --vpc-id $VPC_ID \
  --query 'GroupId' \
  --output text)

# Allow HTTP/HTTPS from internet
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Allow outbound (for Repo B calls)
aws ec2 authorize-security-group-egress \
  --group-id $SG_ID \
  --protocol -1 \
  --cidr 0.0.0.0/0
```

**Note:** If you already have a VPC, use your existing subnets and security groups.

---

## Step 7: Request SSL Certificate in ACM

```bash
# Request certificate (must be in us-east-1 for ALB)
aws acm request-certificate \
  --domain-name gateway.buyechelon.com \
  --validation-method DNS \
  --region us-east-1

# Get validation records
CERT_ARN=$(aws acm list-certificates \
  --region us-east-1 \
  --query 'CertificateSummaryList[?DomainName==`gateway.buyechelon.com`].CertificateArn' \
  --output text)

# Add DNS validation records to Route 53 (manual step)
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

---

## Step 8: Create Application Load Balancer

```bash
# Create ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name mcp-gateway-alb \
  --subnets $SUBNET_1 $SUBNET_2 \
  --security-groups $SG_ID \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4 \
  --region us-east-1 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --region us-east-1 \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "ALB DNS: $ALB_DNS"
```

---

## Step 9: Create Target Group

```bash
# Create target group
TG_ARN=$(aws elbv2 create-target-group \
  --name mcp-gateway-targets \
  --protocol HTTP \
  --port 8000 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region us-east-1 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)
```

---

## Step 10: Create ALB Listeners

```bash
# HTTPS listener (port 443)
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --region us-east-1

# HTTP listener (port 80) - redirect to HTTPS
aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
  --region us-east-1
```

---

## Step 11: Register Task Definition

```bash
# Update task definition with your ECR URI
ECR_REPO=$(aws ecr describe-repositories \
  --repository-names mcp-gateway \
  --region us-east-1 \
  --query 'repositories[0].repositoryUri' \
  --output text)

# Replace placeholders in task definition
sed "s|YOUR_ECR_REPO_URI|$ECR_REPO|g" ecs-task-definition.json | \
  sed "s|REGION|us-east-1|g" | \
  sed "s|ACCOUNT|$(aws sts get-caller-identity --query Account --output text)|g" > \
  ecs-task-definition-updated.json

# Register task definition
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition-updated.json \
  --region us-east-1
```

---

## Step 12: Create ECS Service

```bash
# Create service
aws ecs create-service \
  --cluster mcp-gateway-cluster \
  --service-name mcp-gateway-service \
  --task-definition mcp-gateway \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=gateway,containerPort=8000" \
  --region us-east-1
```

---

## Step 13: Configure Route 53 DNS

```bash
# Get hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name \
  --dns-name buyechelon.com \
  --query 'HostedZones[0].Id' \
  --output text | cut -d'/' -f3)

# Get ALB hosted zone ID (always Z35SXDOTRQ7X7K for ALB)
ALB_HOSTED_ZONE="Z35SXDOTRQ7X7K"

# Create Route 53 record
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"CREATE\",
      \"ResourceRecordSet\": {
        \"Name\": \"gateway.buyechelon.com\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"$ALB_HOSTED_ZONE\",
          \"DNSName\": \"$ALB_DNS\",
          \"EvaluateTargetHealth\": true
        }
      }
    }]
  }"
```

---

## Step 14: Verify Deployment

```bash
# Check service status
aws ecs describe-services \
  --cluster mcp-gateway-cluster \
  --services mcp-gateway-service \
  --region us-east-1 \
  --query 'services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount}'

# Test health endpoint
curl https://gateway.buyechelon.com/health

# Test discovery endpoint
curl https://gateway.buyechelon.com/meta.discover
```

---

## Environment Variables

Set these in Secrets Manager (already done in Step 4):

- `ACP_BASE_URL` - Governance Hub URL
- `ACP_KERNEL_KEY` - Kernel API key
- `ALLOWED_ORIGINS` - CORS allowed origins
- `DEFAULT_CORS_ORIGIN` - Default CORS origin

---

## Scaling Configuration

### Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/mcp-gateway-cluster/mcp-gateway-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10 \
  --region us-east-1

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/mcp-gateway-cluster/mcp-gateway-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }' \
  --region us-east-1
```

---

## Cost Estimate

**Fargate Pricing (us-east-1):**
- **0.5 vCPU, 1GB RAM:** ~$0.04/hour = ~$29/month
- **ALB:** ~$0.0225/hour = ~$16/month
- **Data Transfer:** $0.085/GB
- **Route 53:** $0.50/month
- **ACM:** Free
- **CloudWatch Logs:** $0.50/GB ingested

**Estimated Total:** ~$45-50/month for low traffic

---

## Troubleshooting

### Service Not Starting

```bash
# Check service events
aws ecs describe-services \
  --cluster mcp-gateway-cluster \
  --services mcp-gateway-service \
  --region us-east-1 \
  --query 'services[0].events[:5]'

# Check task logs
TASK_ARN=$(aws ecs list-tasks \
  --cluster mcp-gateway-cluster \
  --service-name mcp-gateway-service \
  --region us-east-1 \
  --query 'taskArns[0]' \
  --output text)

aws logs tail /ecs/mcp-gateway --follow
```

### Health Check Failing

```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn $TG_ARN \
  --region us-east-1
```

### Container Not Receiving Traffic

1. Check security group allows traffic from ALB
2. Check target group health checks
3. Verify container is listening on port 8000
4. Check CloudWatch logs for errors

---

## Updating Deployment

```bash
# Build and push new image
docker build -t mcp-gateway:latest .
docker tag mcp-gateway:latest $ECR_REPO:latest
docker push $ECR_REPO:latest

# Force new deployment
aws ecs update-service \
  --cluster mcp-gateway-cluster \
  --service mcp-gateway-service \
  --force-new-deployment \
  --region us-east-1
```

---

## Next Steps

1. ✅ Build and push Docker image
2. ✅ Create ECS cluster and service
3. ✅ Configure ALB and Route 53
4. ✅ Test endpoints
5. ✅ Set up auto-scaling (optional)
6. ✅ Monitor CloudWatch logs

---

**Last Updated:** February 2026  
**Status:** Ready for ECS + Fargate Deployment
