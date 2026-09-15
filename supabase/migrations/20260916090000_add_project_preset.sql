/*
  # Project presets (Step 4)

  1. Changes
    - `projects.preset`      text: which workflow the project was created with
                             ('clone' | 'restyle' | 'describe' | 'content' | 'manual' | '')
    - `projects.design_url`  text: reference site whose look is used (Restyle / Describe / My content)
    - `projects.brief`       text: the user's own description (Describe) or content (My content)

  2. Security
    - No RLS changes: the existing project policies already cover these columns.
*/
ALTER TABLE projects ADD COLUMN IF NOT EXISTS preset text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS design_url text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS brief text NOT NULL DEFAULT '';
