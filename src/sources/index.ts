import type { Manga, Source } from './types';
import { mangalib, slashlib, hentailib } from './lib';
import { remanga } from './remanga';
import { mangadex } from './mangadex';
import { madaraSource } from './madara';

export const manhwatop = madaraSource({
  id: 'manhwatop',
  name: 'ManhwaTop',
  web: 'https://manhwatop.com',
  lang: 'en',
});

export const mangaclash = madaraSource({
  id: 'mangaclash',
  name: 'MangaClash',
  web: 'https://toonclash.com',
  lang: 'en',
});

export const toonily = madaraSource({
  id: 'toonily',
  name: 'Toonily',
  web: 'https://toonily.com',
  lang: 'en',
  isAdultSource: true,
});

export const sources: Source[] = [mangalib, remanga, mangadex, slashlib, hentailib, manhwatop, mangaclash, toonily];

export const getSource = (id: string): Source => sources.find((s) => s.id === id) || mangadex;

const normTitle = (s?: string) =>
  (s || '')
    .toLowerCase()
    .replace(/['"`«»()[\]:;.,!?—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Deduplicates a list of Manga items across multiple sources so each title appears only ONCE.
 * Merges `altTitles`, `rating`, and attaches all source entries in `manga.variants`.
 */
export function deduplicateManga(items: Manga[]): Manga[] {
  const groups: Manga[] = [];
  const keyToGroupIdx = new Map<string, number>();

  for (const item of items) {
    const keys = [normTitle(item.title), ...(item.altTitles || []).map(normTitle)].filter((k) => k.length >= 2);
    let matchedIdx: number | undefined;
    for (const k of keys) {
      const idx = keyToGroupIdx.get(k);
      if (idx !== undefined) {
        matchedIdx = idx;
        break;
      }
    }

    if (matchedIdx === undefined) {
      const baseVariant: Manga = { ...item, variants: undefined };
      const group: Manga = {
        ...item,
        altTitles: Array.from(new Set([item.title, ...(item.altTitles || [])].filter(Boolean))),
        variants: [baseVariant],
      };
      const newIdx = groups.length;
      groups.push(group);
      for (const k of keys) keyToGroupIdx.set(k, newIdx);
    } else {
      const group = groups[matchedIdx];
      const baseVariant: Manga = { ...item, variants: undefined };
      const vars = group.variants || [];
      if (!vars.some((v) => v.sourceId === item.sourceId && v.id === item.id)) {
        vars.push(baseVariant);
      }
      group.variants = vars;
      group.altTitles = Array.from(
        new Set([...(group.altTitles || []), item.title, ...(item.altTitles || [])].filter(Boolean)),
      );
      if (!group.rating && item.rating) group.rating = item.rating;
      if (!group.cover && item.cover) {
        group.cover = item.cover;
        group.coverReferer = item.coverReferer;
      }
      if (!group.kind && item.kind) group.kind = item.kind;
      for (const k of keys) keyToGroupIdx.set(k, matchedIdx);
    }
  }

  return groups;
}
