import { reqJson } from '../lib/http';
import { GENRES, type CatalogFilter, type Chapter, type Lang, type Manga, type Page, type Source } from './types';

const API = 'https://api.remanga.org/api/v2';
const IMG = 'https://remanga.org';
const headers = { Referer: 'https://remanga.org/', Origin: 'https://remanga.org' };

const full = (u?: string) => (!u ? '' : u.startsWith('http') ? u : IMG + (u.startsWith('/') ? '' : '/') + u);

const toManga = (m: any): Manga => {
  const typeId = m.type?.id ?? m.type;
  const kind = typeId === 0 ? 'manga' : typeId === 1 ? 'manhwa' : typeId === 2 || typeId === 3 ? 'manhua' : undefined;
  const ageId = m.age_limit?.id ?? m.age_limit ?? 0;
  const genresList: string[] = (m.genres || []).map((g: any) => String(g?.name || g || '').toLowerCase());
  const isHentai = Boolean(m.is_erotic || genresList.some((g) => g.includes('хентай') || g.includes('эротика')));
  const isAdult = Boolean(!isHentai && ageId >= 2);
  const rawRate = parseFloat(m.avg_rating || m.rating || '');
  return {
    id: m.dir || String(m.id),
    sourceId: 'remanga',
    title: String(m.rus_name || m.main_name || m.en_name || m.secondary_name || 'Без названия'),
    altTitles: [m.en_name, m.secondary_name, m.main_name, m.another_name].filter(
      (x) => typeof x === 'string' && x.length > 0,
    ),
    cover: full(m.cover?.high || m.cover?.mid || m.cover?.low || m.img?.high || m.img?.mid),
    coverReferer: 'https://remanga.org/',
    status: typeof m.status === 'string' ? m.status : m.status?.name,
    kind,
    isAdult,
    isHentai,
    rating: Number.isFinite(rawRate) && rawRate > 0 ? rawRate : undefined,
  };
};

const filterItems = (items: Manga[], f: CatalogFilter): Manga[] => {
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

export const remanga: Source = {
  id: 'remanga',
  name: 'Remanga',
  lang: 'ru',

  async popular(page = 1, f: CatalogFilter) {
    const orderMap: Record<string, string> = {
      popular: '-views',
      rating: '-views',
      new: '-id',
      chapters: '-count_chapters',
    };
    const p: string[] = [
      `page=${page}`,
      `count=24`,
      `ordering=${orderMap[f.sort || 'popular'] || '-views'}`,
      `count_chapters__gte=3`,
    ];

    if (f.kind === 'manga') p.push('types=0');
    else if (f.kind === 'manhwa') p.push('types=1');
    else if (f.kind === 'manhua') p.push('types=2');

    if (f.genres?.length) {
      for (const gid of f.genres) {
        const g = GENRES.find((x) => x.id === gid);
        if (g?.remanga) p.push(`genres=${g.remanga}`);
      }
    }

    if (f.adult === 'only') p.push('age_limit=2');
    else if (f.adult === 'hide' && f.hentai === 'hide') {
      p.push('age_limit=0');
      p.push('age_limit=1');
    }

    const r = await reqJson(`${API}/search/catalog/?${p.join('&')}`, { headers });
    const list = r.results || r.content || [];
    return filterItems(list.map(toManga), f);
  },

  async search(q: string, page = 1, f: CatalogFilter) {
    const r = await reqJson(`${API}/search/?query=${encodeURIComponent(q)}&page=${page}&count=24`, { headers });
    const list = r.results || r.content || [];
    return filterItems(list.map(toManga), f);
  },

  async detail(dir: string) {
    const r = await reqJson(`${API}/titles/${encodeURIComponent(dir)}/`, { headers });
    const d = r.content || r;
    const base = toManga(d);
    return {
      ...base,
      id: dir,
      description: String(d.description || '').replace(/<[^>]+>/g, '').trim(),
      tags: [...(d.genres || []), ...(d.categories || [])].map((g: any) => g.name).filter(Boolean),
    };
  },

  async chapters(dir: string, _lang: Lang): Promise<Chapter[]> {
    const info = await reqJson(`${API}/titles/${encodeURIComponent(dir)}/`, { headers });
    const d = info.content || info;
    const branches: any[] = d.branches || [];
    if (!branches.length) return [];

    const sortedBranches = [...branches].sort((a, b) => (b.count_chapters || 0) - (a.count_chapters || 0));
    const branchId = sortedBranches[0]?.id;
    if (!branchId) return [];

    try {
      const all = await reqJson(`${API}/titles/chapters/?branch_id=${branchId}&ordering=-index`, { headers });
      const list: any[] = all.results || all.content || [];
      if (list.length > 0) {
        return list
          .filter((c: any) => !c.is_paid)
          .map((c: any) => ({
            id: String(c.id),
            number: String(c.chapter ?? ''),
            title: `Том ${c.tome} Гл. ${c.chapter}${c.name ? ' — ' + c.name : ''}`,
            date: c.upload_date?.slice(0, 10),
            lang: 'ru',
          }));
      }
    } catch {}

    const out: Chapter[] = [];
    for (let page = 1; page <= 10; page++) {
      const r = await reqJson(`${API}/titles/chapters/?branch_id=${branchId}&ordering=-index&count=100&page=${page}`, {
        headers,
      });
      const list: any[] = r.results || r.content || [];
      if (!list.length) break;
      for (const c of list) {
        if (c.is_paid) continue;
        out.push({
          id: String(c.id),
          number: String(c.chapter ?? ''),
          title: `Том ${c.tome} Гл. ${c.chapter}${c.name ? ' — ' + c.name : ''}`,
          date: c.upload_date?.slice(0, 10),
          lang: 'ru',
        });
      }
      if (list.length < 100) break;
    }
    return out;
  },

  async pages(chapterId: string): Promise<Page[]> {
    const r = await reqJson(`${API}/titles/chapters/${chapterId}/`, { headers });
    const d = r.content || r;
    const raw = Array.isArray(d.pages) ? d.pages.flat() : [];
    return raw
      .map((p: any) => ({ url: p.link || p.url || '', referer: 'https://remanga.org/' }))
      .filter((p: Page) => Boolean(p.url));
  },
};
