import { reqJson } from '../lib/http';
import { GENRES, type CatalogFilter, type Chapter, type Lang, type Manga, type Page, type Source } from './types';

function extractText(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(extractText).filter(Boolean).join('\n');
  if (typeof val === 'object') {
    if (typeof val.text === 'string') return val.text;
    if (Array.isArray(val.content)) {
      const sep = val.type === 'doc' ? '\n\n' : '';
      return val.content.map(extractText).join(sep);
    }
  }
  return '';
}

function libSource(opts: {
  id: string;
  name: string;
  siteId: number;
  web: string;
  isAdultSource?: boolean;
  isHentaiSource?: boolean;
}): Source {
  const API = 'https://api.lib.social/api';
  const headers = { Referer: opts.web + '/', 'Site-Id': String(opts.siteId), Origin: opts.web };
  let imgServer: string | undefined;

  const getServer = async () => {
    if (imgServer) return imgServer;
    try {
      const r = await reqJson(`${API}/constants?fields[]=imageServers`, { headers });
      const list: any[] = r.data?.imageServers || [];
      const s =
        list.find((x) => x.id === 'compress' && x.site_ids?.includes(opts.siteId)) ||
        list.find((x) => x.id === 'main' && x.site_ids?.includes(opts.siteId));
      imgServer = s?.url || 'https://img3.cdnlibs.org';
    } catch {
      imgServer = 'https://img3.cdnlibs.org';
    }
    return imgServer!;
  };

  const toManga = (m: any): Manga => {
    const typeId = m.type?.id ?? m.type_id;
    const kind = typeId === 1 ? 'manga' : typeId === 5 ? 'manhwa' : typeId === 6 ? 'manhua' : undefined;
    const cautionId = m.ageRestriction?.id ?? m.caution?.id ?? m.caution ?? 0;
    const isHentai = Boolean(opts.isHentaiSource || m.site === 4);
    const isAdult = Boolean(
      !isHentai &&
        (opts.isAdultSource ||
          cautionId === 3 ||
          cautionId === 4 ||
          cautionId === 5 ||
          m.ageRestriction?.label === '18+'),
    );
    const rawRate = parseFloat(m.rating?.average || m.rating?.averageFormated || m.rate_avg || '');
    return {
      id: m.slug_url || m.slug || String(m.id),
      sourceId: opts.id,
      title: String(m.rus_name || m.eng_name || m.name || 'Без названия'),
      altTitles: [m.eng_name, m.name, m.rus_name].filter((x) => typeof x === 'string' && x.length > 0),
      cover: m.cover?.default || m.cover?.md || m.cover?.thumbnail || '',
      coverReferer: opts.web + '/',
      status: typeof m.status === 'string' ? m.status : m.status?.label,
      kind,
      isAdult,
      isHentai,
      rating: Number.isFinite(rawRate) && rawRate > 0 ? rawRate : undefined,
    };
  };

  const buildQuery = (page: number, f: CatalogFilter, q?: string): string | null => {
    // Hentai filter check
    if (opts.isHentaiSource && f.hentai === 'hide') return null;
    if (!opts.isHentaiSource && f.hentai === 'only') return null;
    // Adult 18+ filter check
    if (opts.isAdultSource && !opts.isHentaiSource && f.adult === 'hide') return null;

    const p: string[] = [
      `site_id[]=${opts.siteId}`,
      `page=${page}`,
      `limit=24`,
      `fields[]=rate_avg`,
      `fields[]=rate`,
    ];

    if (q) {
      p.push(`q=${encodeURIComponent(q)}`);
    } else {
      const sortMap: Record<string, string> = {
        popular: 'views',
        rating: 'rate_avg',
        new: 'created_at',
        chapters: 'chap_count',
      };
      const sb = sortMap[f.sort || 'popular'] || 'views';
      p.push(`sort_by=${sb === 'rate_avg' ? 'views' : sb}`);
      p.push(`sort_type=desc`);
    }

    if (f.kind === 'manga') p.push('types[]=1');
    else if (f.kind === 'manhwa') p.push('types[]=5');
    else if (f.kind === 'manhua') p.push('types[]=6');

    if (f.genres?.length) {
      for (const gid of f.genres) {
        const g = GENRES.find((x) => x.id === gid);
        if (g?.lib) p.push(`genres[]=${g.lib}`);
      }
    }

    if (!opts.isHentaiSource) {
      if (f.adult === 'only') {
        p.push('caution[]=3');
      } else if (f.adult === 'hide') {
        p.push('caution[]=0');
      }
    }

    return p.join('&');
  };

  const filterList = (items: Manga[], f: CatalogFilter): Manga[] => {
    let list = items.filter((m) => {
      if (m.isHentai && f.hentai === 'hide') return false;
      if (!m.isHentai && f.hentai === 'only') return false;
      if (m.isAdult && f.adult === 'hide') return false;
      if (!m.isAdult && !m.isHentai && f.adult === 'only') return false;
      return true;
    });
    if (f.sort === 'rating') {
      list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    return list;
  };

  return {
    id: opts.id,
    name: opts.name,
    lang: 'ru',
    isAdultSource: opts.isAdultSource,
    isHentaiSource: opts.isHentaiSource,

    async popular(page = 1, f: CatalogFilter) {
      const qs = buildQuery(page, f);
      if (!qs) return [];
      const r = await reqJson(`${API}/manga?${qs}`, { headers });
      return filterList((r.data || []).map(toManga), f);
    },

    async search(q: string, page = 1, f: CatalogFilter) {
      const qs = buildQuery(page, f, q);
      if (!qs) return [];
      const r = await reqJson(`${API}/manga?${qs}`, { headers });
      return filterList((r.data || []).map(toManga), f);
    },

    async detail(id: string) {
      const r = await reqJson(
        `${API}/manga/${id}?fields[]=summary&fields[]=genres&fields[]=tags&fields[]=authors&fields[]=rate_avg&fields[]=rate`,
        { headers },
      );
      const d = r.data || {};
      const base = toManga(d);
      return {
        ...base,
        id,
        description: extractText(d.summary).trim(),
        author: (d.authors || [])
          .map((a: any) => (typeof a === 'string' ? a : a?.rus_name || a?.name))
          .filter(Boolean)
          .join(', '),
        tags: [...(d.genres || []), ...(d.tags || [])]
          .map((g: any) => (typeof g === 'string' ? g : g?.name))
          .filter(Boolean),
      };
    },

    async chapters(id: string, _lang: Lang): Promise<Chapter[]> {
      const r = await reqJson(`${API}/manga/${id}/chapters`, { headers });
      const out: Chapter[] = [];
      for (const c of r.data || []) {
        const branches = Array.isArray(c.branches) && c.branches.length ? c.branches : [{}];
        const b = branches[0];
        const branchQ = b.branch_id ? `&branch_id=${b.branch_id}` : '';
        out.push({
          id: `${id}::number=${c.number}&volume=${c.volume}${branchQ}`,
          number: String(c.number ?? ''),
          title: `Том ${c.volume} Гл. ${c.number}${c.name ? ' — ' + c.name : ''}`,
          date: typeof b.created_at === 'string' ? b.created_at.slice(0, 10) : undefined,
          lang: 'ru',
        });
      }
      return out.reverse();
    },

    async pages(chapterId: string): Promise<Page[]> {
      const [slug, query] = chapterId.split('::');
      const [srv, r] = await Promise.all([
        getServer(),
        reqJson(`${API}/manga/${slug}/chapter?${query}`, { headers }),
      ]);
      const d = r.data;
      const base = srv.replace(/\/+$/, '');
      return (d?.pages || []).map((p: any) => {
        const raw = String(p.url || p.image || '');
        const url = /^https?:\/\//i.test(raw) ? raw : `${base}/${raw.replace(/^\/+/, '')}`;
        return { url, referer: opts.web + '/' };
      });
    },
  };
}

export const mangalib = libSource({ id: 'mangalib', name: 'MangaLib', siteId: 1, web: 'https://mangalib.me' });
export const slashlib = libSource({
  id: 'slashlib',
  name: 'SlashLib',
  siteId: 2,
  web: 'https://v2.slashlib.me',
  isAdultSource: true,
});
export const hentailib = libSource({
  id: 'hentailib',
  name: 'HentaiLib',
  siteId: 4,
  web: 'https://hentailib.me',
  isAdultSource: true,
  isHentaiSource: true,
});
