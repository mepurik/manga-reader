export type Lang = 'ru' | 'en' | 'all';
export type UILang = 'ru' | 'en';
export type SortBy = 'popular' | 'rating' | 'new' | 'chapters';
export type ContentFilter = 'hide' | 'allow' | 'only';
export type MangaKind = 'all' | 'manga' | 'manhwa' | 'manhua';

export interface CatalogFilter {
  lang: Lang;
  sort?: SortBy;
  genres?: string[];
  adult?: ContentFilter;
  hentai?: ContentFilter;
  kind?: MangaKind;
}

export interface GenreDef {
  id: string;
  name: string;
  nameEn: string;
  md?: string;      // MangaDex UUID
  lib?: number;     // MangaLib genre ID
  remanga?: number; // Remanga genre ID
  madara?: string;  // Madara slug
}

export const GENRES: GenreDef[] = [
  { id: 'action', name: 'Экшен', nameEn: 'Action', md: '391b0423-d847-456f-aff0-8b0cfc03066b', lib: 34, remanga: 2, madara: 'action' },
  { id: 'romance', name: 'Романтика', nameEn: 'Romance', md: '423e2eae-a7a2-4a8b-ac03-a8351462d71d', lib: 61, remanga: 32, madara: 'romance' },
  { id: 'fantasy', name: 'Фэнтези', nameEn: 'Fantasy', md: 'cdc58593-87dd-415e-bbc0-2ec27bf404cc', lib: 72, remanga: 40, madara: 'fantasy' },
  { id: 'isekai', name: 'Исекай', nameEn: 'Isekai', md: 'ace04997-f6bd-436e-b261-779182193d3d', lib: 78, remanga: 51, madara: 'isekai' },
  { id: 'martial', name: 'Боевые искусства', nameEn: 'Martial Arts', md: '799c202e-7daa-44eb-9cf7-8a3c0441531e', lib: 35, remanga: 6, madara: 'martial-arts' },
  { id: 'adventure', name: 'Приключения', nameEn: 'Adventure', md: '87cc87cd-a395-47af-b27a-93258283bbc6', lib: 59, remanga: 29, madara: 'adventure' },
  { id: 'comedy', name: 'Комедия', nameEn: 'Comedy', md: '4d32cc48-9f00-4cca-9b5a-a839f0764984', lib: 50, remanga: 18, madara: 'comedy' },
  { id: 'drama', name: 'Драма', nameEn: 'Drama', md: 'b9af3a63-f058-46de-a9a0-e0c13906197a', lib: 43, remanga: 11, madara: 'drama' },
  { id: 'supernatural', name: 'Сверхъестественное', nameEn: 'Supernatural', md: 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75', lib: 64, remanga: 35, madara: 'supernatural' },
  { id: 'horror', name: 'Ужасы', nameEn: 'Horror', md: 'cdad7e68-1419-41dd-bdce-27753074a640', lib: 70, remanga: 38, madara: 'horror' },
  { id: 'psychological', name: 'Психология', nameEn: 'Psychological', md: '3b60b75c-a2d7-4860-ab56-05f391bb889c', lib: 60, remanga: 30, madara: 'psychological' },
  { id: 'slice', name: 'Повседневность', nameEn: 'Slice of Life', md: 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9', lib: 58, remanga: 27, madara: 'slice-of-life' },
  { id: 'school', name: 'Школа', nameEn: 'School Life', md: 'caaa44eb-cd40-4177-b930-79d3ef2afe87', lib: 73, remanga: 41, madara: 'school-life' },
  { id: 'scifi', name: 'Фантастика', nameEn: 'Sci-Fi', md: '256c8bd9-4904-4360-bf4f-508a76d67183', lib: 56, remanga: 25, madara: 'sci-fi' },
  { id: 'mystery', name: 'Детектив', nameEn: 'Mystery', md: 'ee968100-4191-4968-93d3-f82d72be7e46', lib: 41, remanga: 9, madara: 'mystery' },
  { id: 'thriller', name: 'Триллер', nameEn: 'Thriller', md: '07251805-a27e-4d59-b488-f0bfbec15168', lib: 69, remanga: 37, madara: 'thriller' },
];

export interface Manga {
  id: string;
  sourceId: string;
  title: string;
  altTitles?: string[];
  cover: string;
  coverReferer?: string;
  description?: string;
  author?: string;
  status?: string;
  tags?: string[];
  kind?: 'manga' | 'manhwa' | 'manhua';
  isAdult?: boolean;  // 18+ age rating (Mature / Gore / Seinen 18+ / Ecchi)
  isHentai?: boolean; // Explicit Hentai / Pornographic
  rating?: number;
  variants?: Manga[]; // Grouped entries from other sources for the same manga
}

export interface Chapter {
  id: string;
  title: string;
  number?: string;
  date?: string;
  lang?: string;
}

export interface Page {
  url: string;
  referer?: string;
}

export interface Source {
  id: string;
  name: string;
  lang: 'ru' | 'en' | 'multi';
  isAdultSource?: boolean;
  isHentaiSource?: boolean;
  popular(page: number, filter: CatalogFilter): Promise<Manga[]>;
  search(query: string, page: number, filter: CatalogFilter): Promise<Manga[]>;
  detail(id: string): Promise<Manga>;
  chapters(id: string, lang: Lang): Promise<Chapter[]>;
  pages(chapterId: string): Promise<Page[]>;
}
