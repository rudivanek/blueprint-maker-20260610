/*
  # Server-side API keys + usage log (Step 5)

  1. New tables
    - `user_api_keys`: one row per user with their Anthropic / OpenAI / Firecrawl keys.
      RLS is ON with NO policies, so the browser can never read or write it.
      Only the `ai-proxy` edge function (service role) touches it.
    - `api_usage`: one row per AI call or scrape made through `ai-proxy`
      (provider, model, purpose, tokens, status, duration, project).

  2. Security
    - `user_api_keys`: RLS enabled, no policies (service role only).
    - `api_usage`: RLS enabled; users can SELECT their own rows. Inserts and
      updates are done by the edge function with the service role.
*/

CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  anthropic_key text,
  openai_key text,
  firecrawl_key text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS api_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  key_source text NOT NULL DEFAULT '',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  credits integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'started',
  http_status integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_usage_user_created_idx ON api_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_project_idx ON api_usage (project_id);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_usage' AND policyname = 'Users can read own usage'
  ) THEN
    CREATE POLICY "Users can read own usage"
      ON api_usage FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

