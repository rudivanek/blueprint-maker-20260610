/*
  # Add generated_html to pages

  Stores the latest AI-generated standalone HTML prototype per page, so the
  in-app preview survives reloads and can be regenerated with feedback.

  1. Changes
    - `pages.generated_html` (text, default '') — full standalone HTML document
*/

ALTER TABLE pages ADD COLUMN IF NOT EXISTS generated_html text DEFAULT '';
