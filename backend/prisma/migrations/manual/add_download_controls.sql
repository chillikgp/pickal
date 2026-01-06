-- MIGRATION: add_download_controls
-- 
-- PURPOSE: Replace boolean downloadsEnabled with structured downloads JSON
-- RATIONALE: This preserves photographer intent - if they had enabled downloads,
--            we enable ALL download types for "clients" (the safest default role).
--            If downloads were disabled, we keep all types disabled.
--
-- RUN: npx prisma db execute --file ./prisma/migrations/manual/add_download_controls.sql
--
-- WARNING: This is a one-way migration. Ensure you have a backup.

-- Step 1: Add the new downloads column (without dropping old one yet)
ALTER TABLE "galleries" ADD COLUMN IF NOT EXISTS "downloads" JSONB;

-- Step 2: Migrate existing data based on downloadsEnabled value
UPDATE "galleries" 
SET "downloads" = CASE 
  WHEN "downloadsEnabled" = true THEN 
    '{"individual":{"enabled":true,"allowedFor":"clients"},"bulkAll":{"enabled":true,"allowedFor":"clients"},"bulkFavorites":{"enabled":true,"allowedFor":"clients","maxCount":200}}'::jsonb
  ELSE 
    '{"individual":{"enabled":false,"allowedFor":"clients"},"bulkAll":{"enabled":false,"allowedFor":"clients"},"bulkFavorites":{"enabled":false,"allowedFor":"clients","maxCount":200}}'::jsonb
END
WHERE "downloads" IS NULL;

-- Step 3: Set default for new galleries
ALTER TABLE "galleries" ALTER COLUMN "downloads" SET DEFAULT '{"individual":{"enabled":false,"allowedFor":"clients"},"bulkAll":{"enabled":false,"allowedFor":"clients"},"bulkFavorites":{"enabled":false,"allowedFor":"clients","maxCount":200}}'::jsonb;

-- Step 4: Make column NOT NULL
ALTER TABLE "galleries" ALTER COLUMN "downloads" SET NOT NULL;

-- Step 5: Drop old column (ONLY after verifying migration worked)
-- Uncomment and run separately after verification:
-- ALTER TABLE "galleries" DROP COLUMN IF EXISTS "downloadsEnabled";

-- Verification query (run this to check migration worked):
-- SELECT id, name, "downloadsEnabled", downloads FROM galleries;
