import { reqJson } from '../lib/http';
import { GENRES, type CatalogFilter, type Chapter, type Lang, type Manga, type Page, type Source } from './types';

const API = 'https://api.mangadex.org';

const pickLoc = (obj: Record<string, string> = {}) =>
  obj.ru || obj.en || obj['ja-ro'] || obj['ko-ro'] || obj['zh-ro'] || Object.values(obj)[0] || '';

const collectAltTitles = (a: any): string[] => {
  const out: string[] = [];
  if (a.title && typeof a.title === 'object') {
    for (const v of Object.values(a.title)) if (typeof v === 'string' && v) out.push(v);
  }
  if (Array.isArray(a.altTitles)) {
    for (const obj of a.altTitles) {
      if (obj && typeof obj === 'object') {
        if (typeof obj.ru === 'string') out.push(obj.ru);
        if (typeof obj.en === 'string') out.push(obj.en);
        if (typeof obj['ja-ro'] === 'string') out.push(obj['ja-ro']);
      }
    }
  }
  return Array.from(new Set(out));
};

const toManga = (d: any, ratingsMap?: Record<string, number>): Manga => {
  const a = d.attributes || {};
  const rels: any[] = d.relationships || [];
  const cov = rels.find((r) => r.type === 'cover_art')?.attributes?.fileName;
  const author = rels.find((r) => r.type === 'author')?.attributes?.name;
  const alts = collectAltTitles(a);
  const ruAlt = a.altTitles?.find((t: any) => t.ru)?.ru;
  const origLang = a.originalLanguage;
  const kind = origLang === 'ja' ? 'manga' : origLang === 'ko' ? 'manhwa' : origLang === 'zh' || origLang === 'zh-hk' ? 'manhua' : undefined;
  const cr = a.contentRating;
  const isHentai = cr === 'pornographic';
  const isAdult = !isHentai && cr === 'erotica';
  return {
    id: d.id,
    sourceId: 'mangadex',
    title: ruAlt || pickLoc(a.title) || 'Untitled',
    altTitles: alts,
    cover: cov ? `https://uploads.mangadex.org/covers/${d.id}/${cov}.256.jpg` : '',
    description: pickLoc(a.description),
    author,
    status: a.status,
    tags: (a.tags || []).map((t: any) => pickLoc(t.attributes?.name)).filter(Boolean),
    kind,
    isAdult,
    isHentai,
    rating: ratingsMap?.[d.id],
  };
};

async function fetchRatings(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  try {
    const qs = ids.slice(0, 50).map((id) => `manga[]=${encodeURIComponent(id)}`).join('&');
    const r = await reqJson(`${API}/statistics/manga?${qs}`);
    const out: Record<string, number> = {};
    for (const [id, st] of Object.entries<any>(r.statistics || {})) {
      const b = Number(st?.rating?.bayesian || st?.rating?.average || 0);
      if (b > 0) out[id] = b;
    }
    return out;
  } catch {
    return {};
  }
}

const buildQuery = (page: number, f: CatalogFilter, title?: string) => {
  const p: string[] = [
    `limit=24`,
    `offset=${(page - 1) * 24}`,
    `includes[]=cover_art`,
    `includes[]=author`,
  ];

  if (title) {
    p.push(`title=${encodeURIComponent(title)}`);
    p.push(`order[relevance]=desc`);
  } else {
    const orderMap: Record<string, string> = {
      popular: 'order[followedCount]=desc',
      rating: 'order[rating]=desc',
      new: 'order[createdAt]=desc',
      chapters: 'order[followedCount]=desc',
    };
    p.push(orderMap[f.sort || 'popular'] || 'order[followedCount]=desc');
  }

  if (f.lang === 'ru') p.push('availableTranslatedLanguage[]=ru');
  else if (f.lang === 'en') p.push('availableTranslatedLanguage[]=en');
  else p.push('availableTranslatedLanguage[]=en&availableTranslatedLanguage[]=ru');

  if (f.kind === 'manga') p.push('originalLanguage[]=ja');
  else if (f.kind === 'manhwa') p.push('originalLanguage[]=ko');
  else if (f.kind === 'manhua') p.push('originalLanguage[]=zh&originalLanguage[]=zh-hk');

  if (f.genres?.length) {
    for (const gid of f.genres) {
      const g = GENRES.find((x) => x.id === gid);
      if (g?.md) p.push(`includedTags[]=${g.md}`);
    }
    p.push('includedTagsMode=AND');
  }

  // Separate 18+ Mature (erotica) and Hentai (pornographic)
  if (f.hentai === 'only') {
    p.push('contentRating[]=pornographic');
  } else if (f.adult === 'only') {
    p.push('contentRating[]=erotica');
    if (f.hentai === 'allow') p.push('contentRating[]=pornographic');
  } else {
    p.push('contentRating[]=safe&contentRating[]=suggestive');
    if (f.adult !== 'hide') p.push('contentRating[]=erotica');
    if (f.hentai === 'allow') p.push('contentRating[]=pornographic');
  }

  return p.join('&');
};

export const mangadex: Source = {
  id: 'mangadex',
  name: 'MangaDex',
  lang: 'multi',

  async popular(page = 1, f: CatalogFilter) {
    const r = await reqJson(`${API}/manga?${buildQuery(page, f)}`);
    const raw: any[] = r.data || [];
    const ratings = await fetchRatings(raw.map((d) => d.id));
    return raw.map((d) => toManga(d, ratings));
  },

  async search(q: string, page = 1, f: CatalogFilter) {
    const r = await reqJson(`${API}/manga?${buildQuery(page, f, q)}`);
    const raw: any[] = r.data || [];
    const ratings = await fetchRatings(raw.map((d) => d.id));
    return raw.map((d) => toManga(d, ratings));
  },

  async detail(id: string) {
    const [r, ratings] = await Promise.all([
      reqJson(`${API}/manga/${id}?includes[]=cover_art&includes[]=author`),
      fetchRatings([id]),
    ]);
    return toManga(r.data, ratings);
  },

  async chapters(id: string, lang: Lang): Promise<Chapter[]> {
    const fetchFeed = async (langs: string[]) => {
      const lq = langs.map((l) => `translatedLanguage[]=${l}`).join('&');
      const all: any[] = [];
      for (let offset = 0; offset < 1500; offset += 500) {
        const url =
          `${API}/manga/${id}/feed?limit=500&offset=${offset}&${lq}` +
          `&order[chapter]=desc&includeEmptyPages=0&includeFuturePublishAt=0` +
          `&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`;
        const r = await reqJson(url);
        const batch: any[] = (r.data || []).filter(
          (c: any) => !c.attributes?.externalUrl && (c.attributes?.pages ?? 1) > 0,
        );
        all.push(...batch);
        if ((r.data || []).length < 500) break;
      }
      return all;
    };

    const primaryLangs = lang === 'all' ? ['ru', 'en'] : [lang];
    let list = await fetchFeed(primaryLangs);
    if (!list.length && lang !== 'all') {
      list = await fetchFeed(['ru', 'en']);
    }

    const seen = new Set<string>();
    const out: Chapter[] = [];
    for (const c of list) {
      const a = c.attributes || {};
      const key = `${a.translatedLanguage}:${a.chapter ?? c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: c.id,
        number: a.chapter || '',
        title: `${a.chapter ? `Гл. ${a.chapter}` : 'Сигл'}${a.title ? ` — ${a.title}` : ''} [${(a.translatedLanguage || '').toUpperCase()}]`,
        date: a.publishAt?.slice(0, 10),
        lang: a.translatedLanguage,
      });
    }
    return out;
  },

  async pages(chapterId: string): Promise<Page[]> {
    const r = await reqJson(`${API}/at-home/server/${chapterId}`);
    const h = r.chapter.hash;
    const files: string[] = r.chapter.dataSaver?.length ? r.chapter.dataSaver : r.chapter.data;
    const mode = r.chapter.dataSaver?.length ? 'data-saver' : 'data';
    return files.map((f) => ({ url: `${r.baseUrl}/${mode}/${h}/${f}` }));
  },
};
