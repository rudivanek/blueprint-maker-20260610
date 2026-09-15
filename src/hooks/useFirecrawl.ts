// src/hooks/useFirecrawl.ts
//
// CHANGE IN THIS VERSION:
// - scrapeForDesign now also requests a full-page screenshot, so the design
//   system extraction can be grounded in what the page actually looks like
//   (rendered colors, real fonts) instead of CSS text alone.

import { useState } from 'react';
import { firecrawlScrape } from '../lib/aiProxy';

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

// Step 5: scrapes go through the ai-proxy edge function (key stays on the server).
export function useFirecrawl() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const scrapeForDesign = async (url: string): Promise<{ extract: Record<string, unknown>; rawHtml: string; screenshot: string } | null> => {
    setLoading(true);
    setError(null);
    setStatus('Connecting to Firecrawl...');

    try {
      setStatus('Crawling site for design data...');
      const data = await firecrawlScrape<FirecrawlResponse>({
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
      }, 'scrape-design');
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
      const data = await firecrawlScrape<FirecrawlResponse>({
        url,
        formats: ['rawHtml', 'markdown', 'screenshot@fullPage'],
        onlyMainContent: false,
      }, 'scrape-structure');
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

  return { scrapeForDesign, scrapeForStructure, loading, status, error };
}