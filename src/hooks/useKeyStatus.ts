// src/hooks/useKeyStatus.ts — Step 5: which API keys the server has for this user.
import { useEffect, useState } from 'react';
import { getKeyStatus, onKeyStatus, type KeyStatus } from '../lib/aiProxy';

export function useKeyStatus() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getKeyStatus().then(s => { if (alive) setStatus(s); }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    const off = onKeyStatus(s => { if (alive) setStatus(s); });
    return () => { alive = false; off(); };
  }, []);

  return {
    status,
    error,
    loading: !status && !error,
    has: {
      anthropic: !!status?.keys.anthropic.set,
      openai: !!status?.keys.openai.set,
      firecrawl: !!status?.keys.firecrawl.set,
    },
  };
}

