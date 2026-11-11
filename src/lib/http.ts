import type { Page } from '../sources/types';

declare global {
  interface Window {
    __RUST_BACKEND__?: boolean;
    api?: {
      http(
        url: string,
        opts?: { method?: string; headers?: Record<string, string>; body?: string },
      ): Promise<{ status: number; ok: boolean; text: string }>;
      downloadChapter?(payload: {
        manga_title: string;
        chapter_title: string;
        pages: { url: string; referer?: string }[];
        upscale?: string;
      }): Promise<DownloadResult>;
      openFolder?(path?: string): Promise<void>;
      translatePage?(
        url: string,
        referer: string | undefined,
        targetLang: string,
      ): Promise<TranslatedBubble[]>;
    };
  }
}

export interface ReqOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const isRust = () => typeof window !== 'undefined' && Boolean(window.__RUST_BACKEND__);
const hasElectron = () => typeof window !== 'undefined' && Boolean(window.api);

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
  if (window.api?.http) {
    const res = await window.api.http(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.text;
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
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
  if (hasElectron()) {
    return `mimg://img/?u=${encodeURIComponent(url)}${ref}${up}`;
  }
  return url;
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
  const payload = {
    manga_title: mangaTitle,
    chapter_title: chapterTitle,
    pages: pages.map((p) => ({ url: p.url, referer: p.referer })),
    upscale: upscale || 'off',
  };
  if (isRust()) {
    const r = await fetch('http://mhttp.localhost/download-chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  }
  if (window.api?.downloadChapter) {
    return window.api.downloadChapter(payload);
  }
  return { ok: false, dir: '', cbz: '', count: 0, error: 'Not supported on this platform' };
}

export async function openDownloadsFolder(path = ''): Promise<void> {
  if (isRust()) {
    await fetch('http://mhttp.localhost/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).catch(() => {});
    return;
  }
  if (window.api?.openFolder) {
    await window.api.openFolder(path).catch(() => {});
  }
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
  if (isRust()) {
    const r = await fetch('http://mhttp.localhost/translate-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_lang: targetLang }),
    });
    const j = await r.json();
    return j.translated || text;
  }
  try {
    const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const arr = await reqJson<any[]>(gUrl);
    if (Array.isArray(arr?.[0])) {
      return arr[0].map((seg: any) => seg?.[0] || '').join('') || text;
    }
  } catch {
    // ignore
  }
  return text;
}

export async function translatePageApi(
  url: string,
  referer: string | undefined,
  targetLang: string,
): Promise<TranslatedBubble[]> {
  if (!url || !targetLang || targetLang === 'off') return [];
  if (isRust()) {
    const r = await fetch('http://mhttp.localhost/translate-page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, referer, target_lang: targetLang }),
    });
    const j = await r.json();
    return Array.isArray(j.bubbles) ? j.bubbles : [];
  }
  if (window.api?.translatePage) {
    return window.api.translatePage(url, referer, targetLang);
  }
  return [];
}
