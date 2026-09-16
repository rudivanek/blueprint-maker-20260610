/*
  # AI model per project

  1. Changes
    - `projects.ai_model` text: the AI model this project uses (e.g. 'claude-sonnet-5',
      'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-4-6', 'gpt-4.1').
      '' = project created before this setting → the app uses Claude Sonnet 4.6.

  2. Security
    - No RLS changes: the existing project policies already cover this column.
*/
ALTER TABLE projects ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT '';
