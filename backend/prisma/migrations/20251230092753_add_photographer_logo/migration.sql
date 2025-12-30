-- CreateEnum
CREATE TYPE "GalleryAccessMode" AS ENUM ('PRIVATE_KEY', 'GUEST_SELFIE');

-- CreateEnum
CREATE TYPE "SelectionState" AS ENUM ('DISABLED', 'OPEN', 'LOCKED');

-- CreateEnum
CREATE TYPE "PrintRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED');

-- CreateTable
CREATE TABLE "photographers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photographers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "galleries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3),
    "privateKey" TEXT NOT NULL,
    "accessModes" "GalleryAccessMode"[] DEFAULT ARRAY['PRIVATE_KEY', 'GUEST_SELFIE']::"GalleryAccessMode"[],
    "downloadsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "downloadResolution" TEXT NOT NULL DEFAULT 'web',
    "selectionState" "SelectionState" NOT NULL DEFAULT 'DISABLED',
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "coverPhotoId" TEXT,
    "photographerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "galleries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "galleryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalKey" TEXT NOT NULL,
    "webKey" TEXT NOT NULL,
    "lqipBase64" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" INTEGER,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "galleryId" TEXT NOT NULL,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_data" (
    "id" TEXT NOT NULL,
    "externalFaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'rekognition',
    "boundingBox" JSONB,
    "confidence" DOUBLE PRECISION,
    "photoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "primary_clients" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "galleryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "primary_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "selfieKey" TEXT,
    "matchedPhotoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "galleryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selections" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "primaryClientId" TEXT NOT NULL,
    "addedBySessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "primaryClientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_requests" (
    "id" TEXT NOT NULL,
    "status" "PrintRequestStatus" NOT NULL DEFAULT 'PENDING',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "size" TEXT,
    "notes" TEXT,
    "responseNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "photoId" TEXT NOT NULL,
    "primaryClientId" TEXT,
    "guestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photographers_email_key" ON "photographers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "galleries_privateKey_key" ON "galleries"("privateKey");

-- CreateIndex
CREATE INDEX "galleries_photographerId_idx" ON "galleries"("photographerId");

-- CreateIndex
CREATE INDEX "galleries_privateKey_idx" ON "galleries"("privateKey");

-- CreateIndex
CREATE INDEX "sections_galleryId_idx" ON "sections"("galleryId");

-- CreateIndex
CREATE INDEX "photos_galleryId_idx" ON "photos"("galleryId");

-- CreateIndex
CREATE INDEX "photos_sectionId_idx" ON "photos"("sectionId");

-- CreateIndex
CREATE INDEX "face_data_photoId_idx" ON "face_data"("photoId");

-- CreateIndex
CREATE INDEX "face_data_externalFaceId_idx" ON "face_data"("externalFaceId");

-- CreateIndex
CREATE UNIQUE INDEX "primary_clients_sessionToken_key" ON "primary_clients"("sessionToken");

-- CreateIndex
CREATE INDEX "primary_clients_galleryId_idx" ON "primary_clients"("galleryId");

-- CreateIndex
CREATE INDEX "primary_clients_sessionToken_idx" ON "primary_clients"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "guests_sessionToken_key" ON "guests"("sessionToken");

-- CreateIndex
CREATE INDEX "guests_galleryId_idx" ON "guests"("galleryId");

-- CreateIndex
CREATE INDEX "guests_sessionToken_idx" ON "guests"("sessionToken");

-- CreateIndex
CREATE INDEX "guests_mobileNumber_galleryId_idx" ON "guests"("mobileNumber", "galleryId");

-- CreateIndex
CREATE INDEX "selections_primaryClientId_idx" ON "selections"("primaryClientId");

-- CreateIndex
CREATE INDEX "selections_photoId_idx" ON "selections"("photoId");

-- CreateIndex
CREATE UNIQUE INDEX "selections_photoId_primaryClientId_key" ON "selections"("photoId", "primaryClientId");

-- CreateIndex
CREATE INDEX "comments_photoId_idx" ON "comments"("photoId");

-- CreateIndex
CREATE INDEX "comments_primaryClientId_idx" ON "comments"("primaryClientId");

-- CreateIndex
CREATE INDEX "print_requests_photoId_idx" ON "print_requests"("photoId");

-- CreateIndex
CREATE INDEX "print_requests_primaryClientId_idx" ON "print_requests"("primaryClientId");

-- CreateIndex
CREATE INDEX "print_requests_guestId_idx" ON "print_requests"("guestId");

-- CreateIndex
CREATE INDEX "print_requests_status_idx" ON "print_requests"("status");

-- AddForeignKey
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "photographers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_data" ADD CONSTRAINT "face_data_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primary_clients" ADD CONSTRAINT "primary_clients_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selections" ADD CONSTRAINT "selections_primaryClientId_fkey" FOREIGN KEY ("primaryClientId") REFERENCES "primary_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_primaryClientId_fkey" FOREIGN KEY ("primaryClientId") REFERENCES "primary_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_requests" ADD CONSTRAINT "print_requests_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_requests" ADD CONSTRAINT "print_requests_primaryClientId_fkey" FOREIGN KEY ("primaryClientId") REFERENCES "primary_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_requests" ADD CONSTRAINT "print_requests_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
