/*
  # Prototype version history (sync part 3)

  1. New table `prototype_versions`
    - Snapshots of a page's prototype (pages.generated_html) taken before it is
      replaced (Generate Fresh, Update prototype, AI changes, editing on page,
      restore). The app keeps the newest 10 per page.
    - `changes` = the page's change list at that moment.

  2. Security
    - RLS on: users only see, add and delete their own versions, and only for
      pages of their own projects. Versions are never updated.
    - Deleting a page deletes its versions (cascade).
*/
CREATE TABLE IF NOT EXISTS prototype_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  html text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prototype_versions_page_created_idx
  ON prototype_versions (page_id, created_at DESC);

ALTER TABLE prototype_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own prototype versions"
  ON prototype_versions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own prototype versions"
  ON prototype_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM pages
      JOIN projects ON projects.id = pages.project_id
      WHERE pages.id = prototype_versions.page_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own prototype versions"
  ON prototype_versions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());