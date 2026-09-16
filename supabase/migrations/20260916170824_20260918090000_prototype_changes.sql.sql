/*
  # Prototype change list (sync part 2)

  1. Changes
    - `pages.prototype_changes` jsonb: changes approved on the prototype after it was
      built (AI element changes, "Describe changes", manual edits that are not part
      of the sections). Used in the blueprint, in rebuilds and in the export.
      Each entry: { id, at, kind, sectionId?, target?, request, plan? }

  2. Security
    - No RLS changes: the existing page policies already cover this column.
*/
ALTER TABLE pages ADD COLUMN IF NOT EXISTS prototype_changes jsonb NOT NULL DEFAULT '[]'::jsonb;