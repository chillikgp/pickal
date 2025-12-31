# Pickal Backend

Node.js + Express API for the Pickal client gallery application.

## Tech Stack

- **Runtime**: Node.js 18
- **Framework**: Express.js
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma
- **Storage**: AWS S3
- **Face Recognition**: AWS Rekognition

## Local Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The server runs on `http://localhost:3001` by default.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection string | ✅ |
| `JWT_SECRET` | Secret key for JWT signing | ✅ |
| `JWT_EXPIRES_IN` | JWT expiration (e.g., `7d`) | ✅ |
| `PORT` | Server port (default: 3001) | ❌ |
| `FRONTEND_URL` | Frontend URL for CORS | ✅ |
| `USE_MOCK_SERVICES` | Use local mocks instead of AWS | ❌ |
| `AWS_ACCESS_KEY_ID` | AWS credentials | Production |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | Production |
| `AWS_REGION` | AWS region (e.g., `ap-south-1`) | Production |
| `S3_BUCKET` | S3 bucket name | Production |
| `REKOGNITION_COLLECTION_ID` | Rekognition collection | Production |

---

## Docker

### Build Image

```bash
docker build -t pickal-backend .
```

### Run Container Locally

```bash
docker run -p 8080:8080 --env-file .env pickal-backend
```

### Verify

```bash
curl http://localhost:8080/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## Google Cloud Run Deployment

### Prerequisites

1. Google Cloud project with billing enabled
2. Cloud Run API enabled
3. Artifact Registry repository created

### Deploy Steps

```bash
# Authenticate with Google Cloud
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Build and push to Artifact Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/pickal-backend

# Deploy to Cloud Run
gcloud run deploy pickal-backend \
  --image gcr.io/YOUR_PROJECT_ID/pickal-backend \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=..." \
  --set-env-vars "JWT_SECRET=..." \
  --set-env-vars "JWT_EXPIRES_IN=7d" \
  --set-env-vars "FRONTEND_URL=https://your-frontend.vercel.app" \
  --set-env-vars "USE_MOCK_SERVICES=false" \
  --set-env-vars "AWS_ACCESS_KEY_ID=..." \
  --set-env-vars "AWS_SECRET_ACCESS_KEY=..." \
  --set-env-vars "AWS_REGION=ap-south-1" \
  --set-env-vars "S3_BUCKET=..." \
  --set-env-vars "REKOGNITION_COLLECTION_ID=..."
```

### Cloud Run Compatibility Notes

✅ **This backend is Cloud Run compatible:**

- Single HTTP server listening on `PORT`
- Stateless (uses external AWS services)
- No background workers or cron jobs
- No WebSockets or long-lived connections
- Graceful shutdown on SIGTERM
- All configuration via environment variables

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/auth/register` | Register photographer |
| POST | `/api/auth/login` | Login |
| GET | `/api/galleries` | List galleries |
| POST | `/api/galleries` | Create gallery |
| GET | `/api/photos` | List photos |
| POST | `/api/photos/upload` | Upload photos |
| POST | `/api/face/match` | Match faces in selfie |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production server |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Prisma Studio |
