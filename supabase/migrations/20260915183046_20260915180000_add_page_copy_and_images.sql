/*
  # Page assets captured at import (no AI)
  1. Changes
    - pages.copy_md   (text) — verbatim visible text of the imported page, grouped by section
    - pages.images_md (text) — real image URLs of the imported page, grouped by section
  2. Security
    - No policy changes: the existing RLS on pages already covers these columns.
*/
ALTER TABLE pages ADD COLUMN IF NOT EXISTS copy_md text NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS images_md text NOT NULL DEFAULT '';