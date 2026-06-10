/*
  # Add layout_contract to sections table

  ## Summary
  Adds a `layout_contract` column to the sections table.
  This is a structured text field that acts as the authoritative
  structural specification for each section, capturing:
  - Section role
  - Exact layout pattern
  - Column count
  - Image/content position
  - Card/grid structure
  - Alignment rules
  - What must not be changed
  - Desktop structure
  - Mobile stacking behavior

  ## Changes
  - `sections.layout_contract` (text, default '') — structure-first contract field

  ## Notes
  - Existing rows default to empty string (no data loss)
  - No RLS changes needed — sections table already has appropriate policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sections' AND column_name = 'layout_contract'
  ) THEN
    ALTER TABLE sections ADD COLUMN layout_contract text DEFAULT '' NOT NULL;
  END IF;
END $$;
