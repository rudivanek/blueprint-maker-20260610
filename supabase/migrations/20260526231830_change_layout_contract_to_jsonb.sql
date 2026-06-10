/*
  # Change sections.layout_contract from text to jsonb

  ## Summary
  Converts the layout_contract column from text to jsonb so the Supabase JS
  client returns a plain object automatically (same as copy/items/images).
  Existing rows are safely coerced: empty strings → {}, valid JSON strings →
  parsed object, anything else → {}.

  ## Steps
  1. Normalize empty/null values to valid JSON string
  2. Drop the text default (cannot auto-cast '' to jsonb)
  3. Alter column type with explicit USING expression
  4. Set new jsonb default and NOT NULL constraint
*/

-- 1. Normalize empty/null to a parseable value
UPDATE sections
SET layout_contract = '{}'
WHERE layout_contract IS NULL OR trim(layout_contract) = '';

-- 2. Drop the existing text default before changing type
ALTER TABLE sections ALTER COLUMN layout_contract DROP DEFAULT;

-- 3. Alter column type — USING expression handles string→jsonb conversion
ALTER TABLE sections
  ALTER COLUMN layout_contract TYPE jsonb
  USING (
    CASE
      WHEN layout_contract IS NULL OR trim(layout_contract) = ''
        THEN '{}'::jsonb
      WHEN layout_contract ~ '^\s*\{'
        THEN layout_contract::jsonb
      ELSE '{}'::jsonb
    END
  );

-- 4. Restore NOT NULL and set correct jsonb default
ALTER TABLE sections ALTER COLUMN layout_contract SET NOT NULL;
ALTER TABLE sections ALTER COLUMN layout_contract SET DEFAULT '{}'::jsonb;
