import { reqDoc, reqText } from '../lib/http';
import { GENRES, type CatalogFilter, type Chapter, type Lang, type Manga, type Page, type Source } from './types';

const pickImg = (el?: Element | null): string => {
  if (!el) return '';
  for (const a of ['data-src', 'data-lazy-src', 'data-cfsrc', 'srcset', 'src']) {
    const v = el.getAttribute(a)?.trim();
    if (v && !v.startsWith('data:')) return v.split(' ')[0];
  }
  return '';
};

const parseRating = (root: Element | Document): number | undefined => {
  const txt =
    root.querySelector('.post-total-rating .score, .score.font-meta, .total_votes, .rate-number')?.textContent?.trim() ||
    '';
  const n = parseFloat(txt);
  if (Number.isFinite(n) && n > 0 && n <= 10) {
    // Madara often uses a 5-star scale; normalize to 10-point scale if <= 5.0
    return n <= 5 ? Number((n * 2).toFixed(1)) : Number(n.toFixed(1));
  }
  return undefined;
};

export function madaraSource(opts: {
  id: string;
  name: string;
  web: string;
  lang: 'ru' | 'en';
  isAdultSource?: boolean;
  isHentaiSource?: boolean;
}): Source {
  const ref = opts.web + '/';

  const parseList = (doc: Document): Manga[] => {
    const cards = doc.querySelectorAll('.page-item-detail, .c-tabs-item__content, .manga__item');
    const out: Manga[] = [];
    cards.forEach((c) => {
      const a = c.querySelector<HTMLAnchorElement>('.post-title a, h3 a, h5 a');
      const img = c.querySelector('img');
      if (!a?.href) return;
      const badgeText = c.textContent || '';
      const is18 = Boolean(opts.isAdultSource || /\b(18\+|adult|mature)\b/i.test(badgeText));
      const isHentai = Boolean(opts.isHentaiSource || /\b(hentai)\b/i.test(badgeText));
      const rawRate = parseRating(c);
      out.push({
        id: a.href,
        sourceId: opts.id,
        title: a.textContent?.trim() || 'Untitled',
        cover: pickImg(img),
        coverReferer: ref,
        isAdult: is18 && !isHentai,
        isHentai,
        rating: rawRate,
      });
    });
    return out;
  };

  const parseChaptersFromDoc = (doc: Document | Element): Chapter[] => {
    const out: Chapter[] = [];
    const seen = new Set<string>();
    doc.querySelectorAll('li.wp-manga-chapter a, .chapter-li a').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (!href || seen.has(href)) return;
      seen.add(href);
      const li = a.closest('li');
      const title = a.textContent?.trim() || 'Chapter';
      const numMatch = title.match(/(?:ch(?:apter)?|гл(?:ава)?|ep(?:isode)?)[\s.#:-]*([0-9]+(?:\.[0-9]+)?)/i) || title.match(/([0-9]+(?:\.[0-9]+)?)/);
      out.push({
        id: href,
        number: numMatch?.[1],
        title,
        date: li?.querySelector('.chapter-release-date')?.textContent?.trim(),
        lang: opts.lang,
      });
    });
    return out;
  };

  return {
    id: opts.id,
    name: opts.name,
    lang: opts.lang,
    isAdultSource: opts.isAdultSource,
    isHentaiSource: opts.isHentaiSource,

    async popular(page = 1, f: CatalogFilter) {
      if (opts.isHentaiSource && f.hentai === 'hide') return [];
      if (!opts.isHentaiSource && f.hentai === 'only') return [];
      if (opts.isAdultSource && !opts.isHentaiSource && f.adult === 'hide') return [];

      const orderMap: Record<string, string> = {
        popular: 'views',
        rating: 'rating',
        new: 'latest',
        chapters: 'views',
      };
      const order = orderMap[f.sort || 'popular'] || 'views';
      let url = `${opts.web}/page/${page}/?s=&post_type=wp-manga&m_orderby=${order}`;
      if (f.genres?.length) {
        const g = GENRES.find((x) => x.id === f.genres![0]);
        if (g?.madara) url += `&genre[]=${encodeURIComponent(g.madara)}`;
      }
      if (f.adult === 'only' && !opts.isAdultSource) {
        url += `&adult=1`;
      } else if (f.adult === 'hide' && !opts.isAdultSource) {
        url += `&adult=0`;
      }
      const doc = await reqDoc(url, { headers: { Referer: ref } });
      return parseList(doc);
    },

    async search(q: string, page = 1, f: CatalogFilter) {
      if (opts.isHentaiSource && f.hentai === 'hide') return [];
      if (opts.isAdultSource && !opts.isHentaiSource && f.adult === 'hide') return [];
      const doc = await reqDoc(`${opts.web}/page/${page}/?s=${encodeURIComponent(q)}&post_type=wp-manga`, {
        headers: { Referer: ref },
      });
      return parseList(doc);
    },

    async detail(url: string) {
      const doc = await reqDoc(url, { headers: { Referer: ref } });
      const rawTitle = doc.querySelector('.post-title h1, .post-title h3, h1')?.textContent?.trim() || 'Untitled';
      const title = rawTitle.replace(/^(HOT|NEW|UP)\s+/i, '').trim();
      const cover = pickImg(doc.querySelector('.summary_image img'));
      const description =
        doc.querySelector('.summary__content, .description-summary, .manga-excerpt')?.textContent?.trim() || '';
      const author = doc.querySelector('.author-content')?.textContent?.trim();
      const tags = Array.from(doc.querySelectorAll('.genres-content a')).map((a) => a.textContent?.trim() || '');
      const rating = parseRating(doc);
      return { id: url, sourceId: opts.id, title, cover, coverReferer: ref, description, author, tags, rating };
    },

    async chapters(url: string, _lang: Lang): Promise<Chapter[]> {
      const doc = await reqDoc(url, { headers: { Referer: ref } });
      const mainContainer = doc.querySelector(
        '.page-content-listing, #manga-chapters-holder, .listing-chapters_wrap, .main-col-inner',
      );
      let out = mainContainer ? parseChaptersFromDoc(mainContainer) : [];

      if (out.length <= 1) {
        const cleanUrl = url.replace(/\/?$/, '/');
        try {
          const ajaxHtml = await reqText(`${cleanUrl}ajax/chapters/`, {
            method: 'POST',
            headers: { Referer: url, Origin: opts.web, 'X-Requested-With': 'XMLHttpRequest' },
          });
          if (ajaxHtml && ajaxHtml.includes('wp-manga-chapter')) {
            const ajaxDoc = new DOMParser().parseFromString(ajaxHtml, 'text/html');
            const parsed = parseChaptersFromDoc(ajaxDoc);
            if (parsed.length > out.length) out = parsed;
          }
        } catch {}
      }

      if (out.length <= 1) {
        const postId =
          doc.querySelector('#manga-chapters-holder')?.getAttribute('data-id') ||
          doc.querySelector('input.rating-post-id')?.getAttribute('value') ||
          doc.body?.className.match(/postid-(\d+)/)?.[1];
        if (postId) {
          try {
            const ajaxHtml = await reqText(`${opts.web}/wp-admin/admin-ajax.php`, {
              method: 'POST',
              headers: {
                Referer: url,
                Origin: opts.web,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
              },
              body: `action=manga_get_chapters&manga=${encodeURIComponent(postId)}`,
            });
            if (ajaxHtml && ajaxHtml.includes('wp-manga-chapter')) {
              const ajaxDoc = new DOMParser().parseFromString(ajaxHtml, 'text/html');
              const parsed = parseChaptersFromDoc(ajaxDoc);
              if (parsed.length > out.length) out = parsed;
            }
          } catch {}
        }
      }

      return out;
    },

    async pages(chapterUrl: string): Promise<Page[]> {
      const doc = await reqDoc(chapterUrl, { headers: { Referer: ref } });
      const imgs = doc.querySelectorAll('.reading-content img, .page-break img');
      const out: Page[] = [];
      imgs.forEach((i) => {
        const u = pickImg(i);
        if (u) out.push({ url: u, referer: ref });
      });
      return out;
    },
  };
}
