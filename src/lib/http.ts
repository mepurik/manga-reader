import type { Page } from '../sources/types';

declare global {
  interface Window {
    __RUST_BACKEND__?: boolean;
  }
}

export interface ReqOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const isRust = () => typeof window !== 'undefined' && Boolean(window.__RUST_BACKEND__);

export async function reqText(url: string, opts?: ReqOpts): Promise<string> {
  if (isRust()) {
    const r = await fetch('http://mhttp.localhost/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, opts }),
    });
    const status = Number(r.headers.get('x-upstream-status') || r.status);
    const text = await r.text();
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status} — ${url}`);
    return text;
  }
  const r = await fetch('/__proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, opts }),
  });
  const status = Number(r.headers.get('x-upstream-status') || r.status);
  const text = await r.text();
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status} — ${url}`);
  return text;
}

export async function reqJson<T = any>(url: string, opts?: ReqOpts): Promise<T> {
  return JSON.parse(await reqText(url, opts));
}

export async function reqDoc(url: string, opts?: ReqOpts): Promise<Document> {
  const html = await reqText(url, opts);
  return new DOMParser().parseFromString(html, 'text/html');
}

export const proxied = (url?: string, referer?: string, upscale?: string) => {
  if (!url) return '';
  const up = upscale && upscale !== 'off' ? `&up=${encodeURIComponent(upscale)}` : '';
  const ref = referer ? `&r=${encodeURIComponent(referer)}` : '';
  if (isRust()) {
    return `http://mimg.localhost/img?u=${encodeURIComponent(url)}${ref}${up}`;
  }
  return `mimg://img/?u=${encodeURIComponent(url)}${ref}${up}`;
};

export interface DownloadResult {
  ok: boolean;
  dir: string;
  cbz: string;
  count: number;
  error?: string;
}

export async function downloadChapterToDisk(
  mangaTitle: string,
  chapterTitle: string,
  pages: Page[],
  upscale?: string,
): Promise<DownloadResult> {
  const endpoint = isRust() ? 'http://mhttp.localhost/download-chapter' : '/__download';
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      manga_title: mangaTitle,
      chapter_title: chapterTitle,
      pages: pages.map((p) => ({ url: p.url, referer: p.referer })),
      upscale: upscale || 'off',
    }),
  });
  return r.json();
}

export async function openDownloadsFolder(path = ''): Promise<void> {
  const endpoint = isRust() ? 'http://mhttp.localhost/open-folder' : '/__open-folder';
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  }).catch(() => {});
}

export interface TranslatedBubble {
  x: number;
  y: number;
  w: number;
  h: number;
  original: string;
  translated: string;
}

export async function translateTextApi(text: string, targetLang: string): Promise<string> {
  if (!text.trim()) return text;
  const endpoint = isRust() ? 'http://mhttp.localhost/translate-text' : '/__translate-text';
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, target_lang: targetLang }),
  });
  const j = await r.json();
  return j.translated || text;
}

export async function translatePageApi(
  url: string,
  referer: string | undefined,
  targetLang: string,
): Promise<TranslatedBubble[]> {
  if (!url || !targetLang || targetLang === 'off') return [];
  const endpoint = isRust() ? 'http://mhttp.localhost/translate-page' : '/__translate-page';
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, referer, target_lang: targetLang }),
  });
  const j = await r.json();
  return Array.isArray(j.bubbles) ? j.bubbles : [];
}
