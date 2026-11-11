import { useEffect, useState } from 'react';
import type { Chapter, ContentFilter, Lang, Manga, UILang } from '../sources/types';
import { tr, type I18nKey } from './i18n';

export type ReadMode = 'webtoon' | 'single' | 'double';
export type UpscaleMode = 'off' | 'anime4k' | 'rust_lanczos' | 'rust_manga_hq' | 'rust_ink' | 'ai_vulkan';
export type AutoTranslateLang = 'off' | 'ru' | 'en' | 'es' | 'de';

export const UPSCALE_OPTIONS: { id: UpscaleMode; labelKey: I18nKey; descKey: I18nKey }[] = [
  { id: 'off', labelKey: 'up_off_label', descKey: 'up_off_desc' },
  { id: 'anime4k', labelKey: 'up_anime4k_label', descKey: 'up_anime4k_desc' },
  { id: 'rust_lanczos', labelKey: 'up_lanczos_label', descKey: 'up_lanczos_desc' },
  { id: 'rust_manga_hq', labelKey: 'up_hq_label', descKey: 'up_hq_desc' },
  { id: 'rust_ink', labelKey: 'up_ink_label', descKey: 'up_ink_desc' },
  { id: 'ai_vulkan', labelKey: 'up_vulkan_label', descKey: 'up_vulkan_desc' },
];

export interface HistoryItem {
  manga: Manga;
  chapterId: string;
  chapterTitle: string;
  page: number;
  at: number;
}

export interface Bookmark {
  id: string;
  manga: Manga;
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  page: number;
  note?: string;
  at: number;
}

export interface StatsData {
  pages: number;
  chapters: number;
  seconds: number;
  days: Record<string, { pages: number; sec: number }>;
  perManga: Record<string, { title: string; cover: string; coverReferer?: string; pages: number; sec: number }>;
}

export interface Profile {
  id: string;
  name: string;
  avatar?: string;
}

export interface Settings {
  uiLang: UILang;
  lang: Lang;
  mode: ReadMode;
  fitWidth: boolean;
  maxWidth: number;
  upscale: UpscaleMode;
  adult: ContentFilter;
  hentai: ContentFilter;
  scrollSensitivity: number;
  autoTranslate: AutoTranslateLang;
}

interface ProfileData {
  library: Manga[];
  history: HistoryItem[];
  bookmarks: Bookmark[];
  stats: StatsData;
  readChapters: Record<string, Record<string, number>>;
  downloadedChapters: Record<string, Record<string, string>>;
}

interface State {
  profiles: Profile[];
  activeId: string;
  byProfile: Record<string, ProfileData>;
  settings: Settings;
}

const KEY = 'manga-reader-v3';

const emptyData = (): ProfileData => ({
  library: [],
  history: [],
  bookmarks: [],
  stats: { pages: 0, chapters: 0, seconds: 0, days: {}, perManga: {} },
  readChapters: {},
  downloadedChapters: {},
});

const defaults: State = {
  profiles: [{ id: 'main', name: 'Reader' }],
  activeId: 'main',
  byProfile: { main: emptyData() },
  settings: {
    uiLang: 'ru',
    lang: 'all',
    mode: 'webtoon',
    fitWidth: true,
    maxWidth: 920,
    upscale: 'rust_manga_hq',
    adult: 'allow',
    hentai: 'hide',
    scrollSensitivity: 1.0,
    autoTranslate: 'off',
  },
};

const load = (): State => {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem('manga-reader-v2');
    if (!raw) return defaults;
    const p = JSON.parse(raw);
    return {
      ...defaults,
      ...p,
      settings: { ...defaults.settings, ...(p.settings || {}) },
    };
  } catch {
    return defaults;
  }
};

let state: State = load();
const subs = new Set<() => void>();

const set = (fn: (s: State) => State) => {
  state = fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  subs.forEach((f) => f());
};

const cur = (s: State): ProfileData => {
  const d = s.byProfile[s.activeId] || emptyData();
  return {
    ...emptyData(),
    ...d,
    readChapters: d.readChapters || {},
    downloadedChapters: d.downloadedChapters || {},
  };
};

const upd = (fn: (d: ProfileData) => ProfileData) =>
  set((s) => ({ ...s, byProfile: { ...s.byProfile, [s.activeId]: fn(cur(s)) } }));

export const mkey = (m: { sourceId: string; id: string }) => `${m.sourceId}:${m.id}`;

export const mTitleKey = (m: Manga) => {
  const raw = (m.title || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '');
  return raw || mkey(m);
};

export const cKey = (ch: Chapter) => (ch.number ? `num:${ch.number}` : `id:${ch.id}`);

export function useStore() {
  const [, tick] = useState(0);
  useEffect(() => {
    const cb = () => tick((x) => x + 1);
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  }, []);

  const data = cur(state);
  const profile = state.profiles.find((p) => p.id === state.activeId) || state.profiles[0];
  const uiLang = state.settings.uiLang || 'ru';

  return {
    library: data.library,
    history: data.history,
    bookmarks: data.bookmarks,
    stats: data.stats,
    readChapters: data.readChapters,
    downloadedChapters: data.downloadedChapters,
    settings: state.settings,
    uiLang,
    t: (k: I18nKey) => tr(uiLang, k),
    profile,
    profiles: state.profiles,

    inLibrary: (m: Manga) =>
      data.library.some((x) => mkey(x) === mkey(m) || mTitleKey(x) === mTitleKey(m)),

    toggleLibrary: (m: Manga) =>
      upd((d) => {
        const exists = d.library.some((x) => mkey(x) === mkey(m) || mTitleKey(x) === mTitleKey(m));
        return {
          ...d,
          library: exists
            ? d.library.filter((x) => mkey(x) !== mkey(m) && mTitleKey(x) !== mTitleKey(m))
            : [m, ...d.library],
        };
      }),

    isChapterRead: (m: Manga, ch: Chapter): boolean => {
      const tk = mTitleKey(m);
      const mk = mkey(m);
      const ck = cKey(ch);
      return Boolean(
        data.readChapters[tk]?.[ck] ||
          data.readChapters[tk]?.[ch.id] ||
          data.readChapters[mk]?.[ck] ||
          data.readChapters[mk]?.[ch.id],
      );
    },

    toggleChapterRead: (m: Manga, ch: Chapter, force?: boolean) =>
      upd((d) => {
        const tk = mTitleKey(m);
        const ck = cKey(ch);
        const existing = { ...(d.readChapters[tk] || {}) };
        const currentlyRead = Boolean(existing[ck] || existing[ch.id]);
        const nextVal = force !== undefined ? force : !currentlyRead;
        if (nextVal) {
          existing[ck] = Date.now();
          existing[ch.id] = Date.now();
        } else {
          delete existing[ck];
          delete existing[ch.id];
        }
        return {
          ...d,
          readChapters: { ...d.readChapters, [tk]: existing },
        };
      }),

    markChaptersUpTo: (m: Manga, chapters: Chapter[], upToIndex: number) =>
      upd((d) => {
        const tk = mTitleKey(m);
        const existing = { ...(d.readChapters[tk] || {}) };
        const now = Date.now();
        for (let i = 0; i <= upToIndex && i < chapters.length; i++) {
          const ch = chapters[i];
          existing[cKey(ch)] = now;
          existing[ch.id] = now;
        }
        return {
          ...d,
          readChapters: { ...d.readChapters, [tk]: existing },
        };
      }),

    markAllChapters: (m: Manga, chapters: Chapter[], read: boolean) =>
      upd((d) => {
        const tk = mTitleKey(m);
        if (!read) {
          const copy = { ...d.readChapters };
          delete copy[tk];
          delete copy[mkey(m)];
          return { ...d, readChapters: copy };
        }
        const existing: Record<string, number> = {};
        const now = Date.now();
        for (const ch of chapters) {
          existing[cKey(ch)] = now;
          existing[ch.id] = now;
        }
        return { ...d, readChapters: { ...d.readChapters, [tk]: existing } };
      }),

    isChapterDownloaded: (m: Manga, ch: Chapter): string | undefined => {
      const tk = mTitleKey(m);
      const ck = cKey(ch);
      return data.downloadedChapters[tk]?.[ck] || data.downloadedChapters[tk]?.[ch.id];
    },

    markChapterDownloaded: (m: Manga, ch: Chapter, folderPath: string) =>
      upd((d) => {
        const tk = mTitleKey(m);
        const existing = { ...(d.downloadedChapters[tk] || {}) };
        existing[cKey(ch)] = folderPath;
        existing[ch.id] = folderPath;
        return {
          ...d,
          downloadedChapters: { ...d.downloadedChapters, [tk]: existing },
        };
      }),

    recordHistory: (item: HistoryItem) =>
      upd((d) => ({
        ...d,
        history: [item, ...d.history.filter((x) => mTitleKey(x.manga) !== mTitleKey(item.manga))].slice(0, 100),
      })),

    clearHistory: () => upd((d) => ({ ...d, history: [] })),

    toggleBookmark: (b: Omit<Bookmark, 'id' | 'at'>) =>
      upd((d) => {
        const id = `${mkey(b.manga)}:${b.chapterId}:${b.page}`;
        const exists = d.bookmarks.some((x) => x.id === id);
        return {
          ...d,
          bookmarks: exists ? d.bookmarks.filter((x) => x.id !== id) : [{ ...b, id, at: Date.now() }, ...d.bookmarks],
        };
      }),

    removeBookmark: (id: string) => upd((d) => ({ ...d, bookmarks: d.bookmarks.filter((x) => x.id !== id) })),

    recordStats: (m: Manga, dPages: number, dSec: number, dCh = 0) =>
      upd((d) => {
        const day = new Date().toISOString().slice(0, 10);
        const k = mkey(m);
        const curDay = d.stats.days[day] || { pages: 0, sec: 0 };
        const curM = d.stats.perManga[k] || {
          title: m.title,
          cover: m.cover,
          coverReferer: m.coverReferer,
          pages: 0,
          sec: 0,
        };
        return {
          ...d,
          stats: {
            pages: d.stats.pages + dPages,
            chapters: d.stats.chapters + dCh,
            seconds: d.stats.seconds + dSec,
            days: { ...d.stats.days, [day]: { pages: curDay.pages + dPages, sec: curDay.sec + dSec } },
            perManga: {
              ...d.stats.perManga,
              [k]: { ...curM, pages: curM.pages + dPages, sec: curM.sec + dSec },
            },
          },
        };
      }),

    switchProfile: (id: string) => set((s) => ({ ...s, activeId: id })),

    addProfile: (name: string, avatar?: string) =>
      set((s) => {
        const id = 'p' + Date.now();
        return {
          ...s,
          profiles: [...s.profiles, { id, name: name.trim() || 'Profile', avatar }],
          byProfile: { ...s.byProfile, [id]: emptyData() },
          activeId: id,
        };
      }),

    updateProfileAvatar: (id: string, avatar?: string) =>
      set((s) => ({
        ...s,
        profiles: s.profiles.map((p) => (p.id === id ? { ...p, avatar } : p)),
      })),

    deleteProfile: (id: string) =>
      set((s) => {
        if (s.profiles.length <= 1) return s;
        const profiles = s.profiles.filter((p) => p.id !== id);
        const { [id]: _, ...byProfile } = s.byProfile;
        return { ...s, profiles, byProfile, activeId: s.activeId === id ? profiles[0].id : s.activeId };
      }),

    updateSettings: (patch: Partial<Settings>) => set((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
  };
}
