// src/hooks/useFirecrawl.ts
//
// CHANGE IN THIS VERSION:
// - scrapeForDesign now also requests a full-page screenshot, so the design
//   system extraction can be grounded in what the page actually looks like
//   (rendered colors, real fonts) instead of CSS text alone.

import { useState } from 'react';
import { usageStore } from '../lib/usage';

interface FirecrawlResponse {
  success: boolean;
  data?: {
    extract?: Record<string, unknown>;
    rawHtml?: string;
    markdown?: string;
    screenshot?: string;
    metadata?: Record<string, unknown>;
  };
}

export function useFirecrawl(apiKey: string) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scrapeForDesign = async (url: string): Promise<{ extract: Record<string, unknown>; rawHtml: string; screenshot: string } | null> => {
    setLoading(true);
    setError(null);
    setStatus('Connecting to Firecrawl...');

    try {
      setStatus('Crawling site for design data...');
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          url,
          formats: ['extract', 'rawHtml', 'screenshot@fullPage'],
          waitFor: 2000,
          extract: {
            schema: {
              type: 'object',
              properties: {
                brand_name: { type: 'string' },
                colors: { type: 'object', description: 'All brand colors found on the site' },
                fonts: { type: 'array', items: { type: 'string' }, description: 'Font families used' },
                logo_url: { type: 'string' },
                primary_color: { type: 'string' },
                accent_color: { type: 'string' },
                background_color: { type: 'string' },
                text_color: { type: 'string' },
              },
            },
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Firecrawl error: ${response.status} — ${err}`);
      }

      const data: FirecrawlResponse = await response.json();
      usageStore.reportScrape();
      setStatus('Design data received.');

      return {
        extract: (data.data?.extract as Record<string, unknown>) || {},
        rawHtml: data.data?.rawHtml || '',
        screenshot: data.data?.screenshot || '',
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const scrapeForStructure = async (url: string): Promise<{ rawHtml: string; markdown: string; screenshot: string } | null> => {
    setLoading(true);
    setError(null);
    setStatus('Fetching HTML and screenshot...');

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          url,
          formats: ['rawHtml', 'markdown', 'screenshot@fullPage'],
          onlyMainContent: false,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Firecrawl error: ${response.status} — ${err}`);
      }

      const data: FirecrawlResponse = await response.json();
      usageStore.reportScrape();
      setStatus('Page data received.');

      return {
        rawHtml: data.data?.rawHtml || '',
        markdown: data.data?.markdown || '',
        screenshot: data.data?.screenshot || '',
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetch a CSS file's text. Tries a plain fetch first (works when the host
   * sends CORS headers); falls back to a Firecrawl scrape (server-side, no
   * CORS limits). Returns null on failure — callers treat it as best effort.
   */
  const fetchCssFile = async (cssUrl: string): Promise<string | null> => {
    // 1. Direct fetch — free and fast when CORS allows it.
    try {
      const r = await fetch(cssUrl);
      if (r.ok) {
        const text = await r.text();
        if (text && text.length > 0) return text;
      }
    } catch {
      // CORS or network — fall through to Firecrawl.
    }

    // 2. Firecrawl fallback (1 credit).
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ url: cssUrl, formats: ['rawHtml'] }),
      });
      if (!response.ok) return null;
      const data: FirecrawlResponse = await response.json();
      usageStore.reportScrape();
      const text = data.data?.rawHtml || data.data?.markdown || '';
      return text || null;
    } catch {
      return null;
    }
  };

  return { scrapeForDesign, scrapeForStructure, fetchCssFile, loading, status, error };
}
