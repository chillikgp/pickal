# Client Gallery for Photographers

A full-stack MVP for photographers to share galleries with clients, featuring face recognition for guest access, photo selection workflows, and print requests.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Storage**: Local filesystem (mock) / AWS S3 + CloudFront (production)
- **Face Recognition**: Mock service (local) / AWS Rekognition (production)

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm

### 1. Start Database

```bash
docker-compose up -d
```

### 2. Setup Backend

```bash
cd backend
npm install
npm run db:generate   # Generate Prisma client
npm run db:push       # Create tables
npm run dev           # Start server on http://localhost:3001
```

### 3. Setup Frontend

```bash
cd frontend
cp .env.example .env.local  # Create environment file
# Edit .env.local and set NEXT_PUBLIC_API_URL=http://localhost:3001
npm install
npm run dev           # Start on http://localhost:3000
```

## Project Structure

```
pickal/
├── docker-compose.yml     # PostgreSQL for local dev
├── backend/
│   ├── src/
│   │   ├── routes/        # API endpoints
│   │   ├── middleware/    # Auth, RBAC, error handling
│   │   ├── services/      # Storage, face recognition, image processing
│   │   └── index.ts       # Express server
│   └── prisma/
│       └── schema.prisma  # Database schema
└── frontend/
    └── src/
        ├── app/           # Next.js pages
        ├── components/    # shadcn/ui + custom components
        └── lib/           # API client, auth context
```

## Features

### Photographer
- Register/Login with JWT auth
- Create and manage galleries
- Upload photos (auto-generates web-optimized + LQIP)
- Control downloads (on/off, resolution)
- Control selection mode (disabled/open/locked)
- View client selections with session tracking
- Manage print requests

### Primary Client (Private Key Access)
- Access gallery via private key
- View all photos
- Select photos (when enabled)
- Add comments
- Request prints
- Download photos (when enabled)

### Guest (Selfie Access)
- Access via mobile number + selfie
- View only matched photos (face recognition)
- Request prints for matched photos
- Download matched photos (when enabled)

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | - | Register photographer |
| POST | /api/auth/login | - | Login photographer |
| GET | /api/auth/me | JWT | Get current user |
| GET | /api/galleries | JWT | List galleries |
| POST | /api/galleries | JWT | Create gallery |
| GET | /api/galleries/:id | JWT/Session | Get gallery |
| PATCH | /api/galleries/:id | JWT | Update gallery |
| DELETE | /api/galleries/:id | JWT | Delete gallery |
| POST | /api/galleries/:id/access | - | Access via private key |
| POST | /api/photos/upload | JWT | Upload photo |
| GET | /api/photos/gallery/:id | JWT/Session | Get gallery photos |
| GET | /api/photos/:id/download | JWT/Session | Get download URL |
| POST | /api/selections/:photoId | Session | Select photo |
| DELETE | /api/selections/:photoId | Session | Unselect photo |
| POST | /api/comments/:photoId | Session | Add comment |
| POST | /api/print-requests/:photoId | Session | Request print |
| POST | /api/face/guest-access | - | Selfie access |

## Environment Variables

### Backend (.env)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/client_gallery
JWT_SECRET=your-secret
USE_MOCK_SERVICES=true  # false for AWS
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Switching to AWS

1. Set `USE_MOCK_SERVICES=false` in backend `.env`
2. Add AWS credentials:
   ```
   AWS_ACCESS_KEY_ID=xxx
   AWS_SECRET_ACCESS_KEY=xxx
   AWS_REGION=ap-south-1
   S3_BUCKET=your-bucket
   CLOUDFRONT_DOMAIN=xxx.cloudfront.net
   REKOGNITION_COLLECTION_ID=your-collection
   ```
3. Implement `aws/s3.service.ts` and `aws/rekognition.service.ts`

## License

MIT
