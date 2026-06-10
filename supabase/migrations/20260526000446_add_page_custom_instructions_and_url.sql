/*
  # Add custom_instructions and page_url to pages table

  1. Changes
    - `pages.custom_instructions` (text) — per-page custom instructions for blueprint generation
    - `pages.page_url` (text) — per-page URL override for structure import (overrides project-level URL)

  2. Notes
    - Both columns default to empty string so existing rows are unaffected
    - No RLS changes needed — pages table already has appropriate policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pages' AND column_name = 'custom_instructions'
  ) THEN
    ALTER TABLE pages ADD COLUMN custom_instructions text DEFAULT '' NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pages' AND column_name = 'page_url'
  ) THEN
    ALTER TABLE pages ADD COLUMN page_url text DEFAULT '' NOT NULL;
  END IF;
END $$;
