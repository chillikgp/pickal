# Cloud Run Deployment Guide — Pickal Backend

Deploy your containerized Node.js backend to Google Cloud Run with pay-per-use pricing, strong cost guardrails, and zero infrastructure complexity. This guide gets you from Docker image to production URL in under 30 minutes.

---

## Prerequisites

- [x] Docker image builds and runs locally
- [x] `/health` endpoint responds
- [x] Google Cloud account with billing enabled
- [x] `gcloud` CLI installed ([install guide](https://cloud.google.com/sdk/docs/install))

---

## Step 1: Set Up Google Cloud Project

```bash
# Login to Google Cloud
gcloud auth login

# Create new project (or use existing)
gcloud projects create pickal-backend --name="Pickal Backend"

# Set as active project
gcloud config set project pickal-backend

# Link billing account (required for Cloud Run)
# Go to: https://console.cloud.google.com/billing/linkedaccount
```

---

## Step 2: Enable Required APIs

```bash
# Enable only what you need (Cloud Run + Artifact Registry)
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

> [!NOTE]
> These APIs have generous free tiers. Cloud Run charges only when processing requests.

---

## Step 3: Create Artifact Registry Repository

```bash
# Create Docker repository in your region
gcloud artifacts repositories create pickal-docker \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Pickal backend Docker images"
```

---

## Step 4: Authenticate Docker with GCP

```bash
# Configure Docker to push to Artifact Registry
gcloud auth configure-docker asia-south1-docker.pkg.dev
```

---

## Step 5: Build, Tag & Push Docker Image

```bash
# Navigate to backend directory
cd /Users/saurav.sahu/Documents/randomprojects/pickal/backend

# Build for linux/amd64 (Cloud Run requirement)
docker build --platform linux/amd64 -t pickal-backend .

# Tag for Artifact Registry
docker tag pickal-backend \
  asia-south1-docker.pkg.dev/pickal-backend/pickal-docker/backend:v1

# Push to registry
docker push \
  asia-south1-docker.pkg.dev/pickal-backend/pickal-docker/backend:v1
```

> [!IMPORTANT]
> Replace `pickal-backend` with your actual GCP project ID if different.

---

## Step 6: Deploy to Cloud Run (Cost-Safe Settings)

```bash
gcloud run deploy pickal-backend \
  --image=asia-south1-docker.pkg.dev/pickal-backend/pickal-docker/backend:v1 \
  --region=asia-south1 \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --concurrency=80 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=60s \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="USE_MOCK_SERVICES=false"
```

### Cost Guardrails Explained

| Setting | Value | Why |
|---------|-------|-----|
| `--min-instances=0` | 0 | **Scale to zero** — no cost when idle |
| `--max-instances=3` | 3 | **Hard cap** — prevents runaway scaling |
| `--concurrency=80` | 80 | Requests per instance before scaling |
| `--cpu=1` | 1 vCPU | Sufficient for Node.js |
| `--memory=512Mi` | 512 MB | Enough for Express + Prisma |
| `--timeout=60s` | 60s | Kill long requests (DDoS protection) |

---

## Step 7: Set Environment Variables (Secrets)

```bash
gcloud run services update pickal-backend \
  --region=asia-south1 \
  --set-env-vars="DATABASE_URL=postgresql://..." \
  --set-env-vars="JWT_SECRET=your-production-secret" \
  --set-env-vars="JWT_EXPIRES_IN=7d" \
  --set-env-vars="FRONTEND_URL=https://your-frontend.vercel.app" \
  --set-env-vars="AWS_ACCESS_KEY_ID=..." \
  --set-env-vars="AWS_SECRET_ACCESS_KEY=..." \
  --set-env-vars="AWS_REGION=ap-south1" \
  --set-env-vars="S3_BUCKET=..." \
  --set-env-vars="REKOGNITION_COLLECTION_ID=..."
```

> [!CAUTION]
> For production, use **Secret Manager** instead of plain env vars:
> ```bash
> gcloud secrets create DATABASE_URL --data-file=-
> gcloud run services update pickal-backend \
>   --set-secrets="DATABASE_URL=DATABASE_URL:latest"
> ```

---

## Step 8: Set Up Billing Budget Alert

```bash
# Create budget via console (CLI is complex)
# Go to: https://console.cloud.google.com/billing/budgets
```

**Recommended settings:**
- Budget amount: **$10/month**
- Alert thresholds: **50%, 90%, 100%**
- Actions: Email notification

> [!WARNING]
> Budgets **alert** but don't **stop** spending. For hard limits, disable billing on the project if budget is exceeded.

---

## Step 9: Verify Deployment

```bash
# Get your Cloud Run URL
gcloud run services describe pickal-backend \
  --region=asia-south1 \
  --format="value(status.url)"

# Test health endpoint
curl https://pickal-backend-xxxxx.a.run.app/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-12-31T..."}
```

---

## Cost & Safety Summary

### How Cloud Run Protects Against Runaway Costs

| Threat | Protection |
|--------|------------|
| DDoS / traffic spike | `max-instances=3` hard cap |
| Long-running requests | `timeout=60s` kills slow requests |
| Idle cost | `min-instances=0` scales to zero |
| Memory abuse | `memory=512Mi` hard limit |
| CPU abuse | `cpu=1` hard limit |

### Pricing (asia-south1)

| Resource | Free Tier | Per Unit |
|----------|-----------|----------|
| Requests | 2M/month | $0.40/M |
| vCPU-seconds | 180,000/month | $0.00002400 |
| Memory GB-seconds | 360,000/month | $0.00000250 |

**Estimate for MVP:** $0-5/month with light traffic

---

## Updating Your Deployment

```bash
# Rebuild with new tag
docker build --platform linux/amd64 -t pickal-backend .
docker tag pickal-backend \
  asia-south1-docker.pkg.dev/pickal-backend/pickal-docker/backend:v2
docker push \
  asia-south1-docker.pkg.dev/pickal-backend/pickal-docker/backend:v2

# Deploy new version
gcloud run deploy pickal-backend \
  --image=asia-south1-docker.pkg.dev/pickal-backend/pickal-docker/backend:v2 \
  --region=asia-south1
```

---

## Final Verification Checklist

- [ ] Backend is live at Cloud Run URL
- [ ] `/health` endpoint returns `{"status":"ok"}`
- [ ] Service shows `min-instances: 0` (scales to zero)
- [ ] Cost is $0 when no traffic
- [ ] `max-instances: 3` confirmed in console
- [ ] Billing budget alert configured
- [ ] No duplicate services created
- [ ] Environment variables set correctly

---

## Quick Reference

| Action | Command |
|--------|---------|
| View logs | `gcloud run logs read pickal-backend --region=asia-south1` |
| View metrics | Console → Cloud Run → pickal-backend → Metrics |
| Delete service | `gcloud run services delete pickal-backend --region=asia-south1` |
| List revisions | `gcloud run revisions list --region=asia-south1` |
