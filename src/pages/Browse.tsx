import { useEffect, useRef, useState } from 'react';
import { deduplicateManga, getSource, sources } from '../sources';
import {
  GENRES,
  type CatalogFilter,
  type ContentFilter,
  type Lang,
  type Manga,
  type MangaKind,
  type SortBy,
} from '../sources/types';
import type { Nav } from '../App';
import MangaGrid from '../components/MangaGrid';
import Icon from '../components/Icon';
import { useStore } from '../lib/store';
import { getDisplayTitle, getSubtitle } from '../lib/i18n';
import { proxied } from '../lib/http';

export default function Browse({ nav }: { nav: Nav }) {
  const { settings, updateSettings, uiLang, t } = useStore();

  // Multi-select sources (default: MangaLib, Remanga, MangaDex)
  const [selectedSources, setSelectedSources] = useState<string[]>(['mangalib', 'remanga', 'mangadex']);
  const [openPanel, setOpenPanel] = useState<'none' | 'genres' | 'sources'>('none');

  const [lang, setLang] = useState<Lang>(settings.lang);
  const [sort, setSort] = useState<SortBy>('popular');
  const [kind, setKind] = useState<MangaKind>('all');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [adult, setAdult] = useState<ContentFilter>(settings.adult || 'allow');
  const [hentai, setHentai] = useState<ContentFilter>(settings.hentai || 'hide');

  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [suggestions, setSuggestions] = useState<Manga[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const [rawItems, setRawItems] = useState<Manga[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);

  const visibleSources = sources.filter((s) => {
    if (s.isHentaiSource && hentai === 'hide') return false;
    if (s.isAdultSource && !s.isHentaiSource && adult === 'hide') return false;
    return true;
  });

  const activeSources = visibleSources.filter((s) => selectedSources.includes(s.id));
  const targetSources = activeSources.length > 0 ? activeSources : visibleSources.slice(0, 3);

  const filter: CatalogFilter = {
    lang,
    sort,
    kind,
    genres: selectedGenres,
    adult,
    hentai,
  };

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Live autocomplete search suggestions as user types
  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoadingSuggest(false);
      return;
    }
    let cancelled = false;
    setLoadingSuggest(true);
    const timer = setTimeout(async () => {
      const settled = await Promise.allSettled(
        targetSources.slice(0, 3).map((s) => s.search(trimmed, 1, filter)),
      );
      if (cancelled) return;
      const merged: Manga[] = [];
      settled.forEach((r) => {
        if (r.status === 'fulfilled') merged.push(...r.value.slice(0, 5));
      });
      setSuggestions(deduplicateManga(merged).slice(0, 7));
      setLoadingSuggest(false);
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, selectedSources.join(','), adult, hentai]);

  const load = async (p: number, reset: boolean, queryOverride?: string) => {
    const activeQ = queryOverride !== undefined ? queryOverride : submittedQ;
    setLoading(true);
    if (reset) setErrs([]);

    const settled = await Promise.allSettled(
      targetSources.map((s) => (activeQ.trim() ? s.search(activeQ.trim(), p, filter) : s.popular(p, filter))),
    );

    const merged: Manga[] = [];
    const errors: string[] = [];
    const maxLen = Math.max(0, ...settled.map((r) => (r.status === 'fulfilled' ? r.value.length : 0)));
    for (let i = 0; i < maxLen; i++) {
      settled.forEach((r) => {
        if (r.status === 'fulfilled' && r.value[i]) merged.push(r.value[i]);
      });
    }
    settled.forEach((r, idx) => {
      if (r.status === 'rejected') {
        errors.push(`${targetSources[idx].name}: ${r.reason?.message || r.reason}`);
      }
    });

    if (sort === 'rating') {
      merged.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    setRawItems((prev) => (reset ? merged : [...prev, ...merged]));
    setErrs(errors);
    setPage(p);
    setLoading(false);
  };

  useEffect(() => {
    load(1, true);
  }, [
    selectedSources.join(','),
    lang,
    sort,
    kind,
    selectedGenres.join(','),
    adult,
    hentai,
    submittedQ,
  ]);

  const items = deduplicateManga(rawItems);

  const toggleGenre = (gid: string) => {
    setSelectedGenres((prev) => (prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]));
  };

  const toggleSource = (sid: string) => {
    setSelectedSources((prev) => {
      if (prev.includes(sid)) {
        return prev.length > 1 ? prev.filter((x) => x !== sid) : prev;
      }
      return [...prev, sid];
    });
  };

  const submitSearch = () => {
    setShowSuggestions(false);
    setSubmittedQ(q.trim());
  };

  const resetAllFilters = () => {
    setSort('popular');
    setKind('all');
    setSelectedGenres([]);
    setQ('');
    setSubmittedQ('');
  };

  return (
    <div>
      {/* Поисковая строка с автодополнением + основные селекторы */}
      <div className="toolbar">
        <div className="searchwrap" ref={searchWrapRef}>
          <div className="searchbox">
            <Icon name="search" size={18} />
            <input
              placeholder={t('search_placeholder')}
              value={q}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                setQ(e.target.value);
                setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch();
                if (e.key === 'Escape') setShowSuggestions(false);
              }}
            />
            {q && (
              <button
                className="clearbtn"
                onClick={() => {
                  setQ('');
                  setSubmittedQ('');
                  setSuggestions([]);
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Выпадающие подсказки при вводе */}
          {showSuggestions && q.trim().length >= 2 && (
            <div className="suggest-dropdown">
              <div className="suggest-header">
                <span>{t('search_suggestions')}</span>
                {loadingSuggest && <span className="muted">{t('loading')}</span>}
              </div>
              {suggestions.map((m) => {
                const title = getDisplayTitle(m, uiLang);
                const sub = getSubtitle(m, uiLang);
                const siteCount = m.variants?.length || 1;
                return (
                  <div
                    key={`${m.sourceId}:${m.id}`}
                    className="suggest-item"
                    onClick={() => {
                      setShowSuggestions(false);
                      nav.open(m);
                    }}
                  >
                    <div className="suggest-Thumb">
                      {m.cover && <img src={proxied(m.cover, m.coverReferer)} alt="" />}
                    </div>
                    <div className="suggest-info">
                      <div className="suggest-title">{title}</div>
                      {sub && <div className="suggest-sub">{sub}</div>}
                      <div className="suggest-meta">
                        <span>{getSource(m.sourceId).name}{siteCount > 1 ? ` +${siteCount - 1}` : ''}</span>
                        {m.rating && m.rating > 0 ? <span>★ {m.rating.toFixed(1)}</span> : null}
                        {m.kind && <span>{m.kind.toUpperCase()}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button className="suggest-footer" onClick={submitSearch}>
                {t('search_show_all')}: «{q.trim()}»
              </button>
            </div>
          )}
        </div>

        <button className="btn primary" onClick={submitSearch}>
          {t('search_btn')}
        </button>

        {/* Сортировка */}
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortBy)}>
          <option value="popular">{t('sort_popular')}</option>
          <option value="rating">{t('sort_rating')}</option>
          <option value="new">{t('sort_new')}</option>
          <option value="chapters">{t('sort_chapters')}</option>
        </select>

        {/* Тип (Манга / Манхва / Маньхуа) */}
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as MangaKind)}>
          <option value="all">{t('kind_all')}</option>
          <option value="manga">{t('kind_manga')}</option>
          <option value="manhwa">{t('kind_manhwa')}</option>
          <option value="manhua">{t('kind_manhua')}</option>
        </select>

        {/* Кнопка разворачивания Жанров (мультивыбор) */}
        <button
          className={'btn filter-toggle' + (openPanel === 'genres' || selectedGenres.length > 0 ? ' active-btn' : '')}
          onClick={() => setOpenPanel(openPanel === 'genres' ? 'none' : 'genres')}
        >
          <span>
            {t('btn_genres')}
            {selectedGenres.length > 0 ? ` (${selectedGenres.length})` : ''}
          </span>
          <Icon name="chevron" size={16} />
        </button>

        {/* Кнопка разворачивания Источников (мультивыбор) */}
        <button
          className={'btn filter-toggle' + (openPanel === 'sources' ? ' active-btn' : '')}
          onClick={() => setOpenPanel(openPanel === 'sources' ? 'none' : 'sources')}
        >
          <span>
            {t('btn_sources')} ({targetSources.length})
          </span>
          <Icon name="chevron" size={16} />
        </button>

        {/* 18+ Возрастной рейтинг (отдельно от Хентая) */}
        <select
          className="select"
          value={adult}
          onChange={(e) => {
            const v = e.target.value as ContentFilter;
            setAdult(v);
            updateSettings({ adult: v });
          }}
        >
          <option value="hide">{t('adult_hide')}</option>
          <option value="allow">{t('adult_allow')}</option>
          <option value="only">{t('adult_only')}</option>
        </select>

        {/* Хентай (отдельно от 18+) */}
        <select
          className="select"
          value={hentai}
          onChange={(e) => {
            const v = e.target.value as ContentFilter;
            setHentai(v);
            updateSettings({ hentai: v });
            if (v !== 'hide' && !selectedSources.includes('hentailib')) {
              setSelectedSources((prev) => [...prev, 'hentailib']);
            }
          }}
        >
          <option value="hide">{t('hentai_hide')}</option>
          <option value="allow">{t('hentai_allow')}</option>
          <option value="only">{t('hentai_only')}</option>
        </select>

        {/* Язык перевода глав */}
        <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          <option value="all">{t('lang_all')}</option>
          <option value="ru">{t('lang_ru')}</option>
          <option value="en">{t('lang_en')}</option>
        </select>
      </div>

      {/* Раскрывающаяся панель мультивыбора Жанров */}
      {openPanel === 'genres' && (
        <div className="panel dropdown-panel">
          <div className="dropdown-panel-head">
            <b>{t('btn_genres')}</b>
            <div style={{ display: 'flex', gap: 8 }}>
              {selectedGenres.length > 0 && (
                <button className="btn small-btn" onClick={() => setSelectedGenres([])}>
                  {t('clear_selection')}
                </button>
              )}
              <button className="iconbtn" onClick={() => setOpenPanel('none')}>
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
          <div className="chips" style={{ marginBottom: 0 }}>
            {GENRES.map((g) => {
              const on = selectedGenres.includes(g.id);
              return (
                <button
                  key={g.id}
                  className={'chip' + (on ? ' on' : '')}
                  onClick={() => toggleGenre(g.id)}
                >
                  {on && <Icon name="check" size={13} />}{' '}
                  {uiLang === 'en' ? g.nameEn : g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Раскрывающаяся панель мультивыбора Источников */}
      {openPanel === 'sources' && (
        <div className="panel dropdown-panel">
          <div className="dropdown-panel-head">
            <b>{t('btn_sources')}</b>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn small-btn"
                onClick={() => setSelectedSources(visibleSources.map((s) => s.id))}
              >
                {t('select_all')}
              </button>
              <button
                className="btn small-btn"
                onClick={() => setSelectedSources(['mangalib', 'remanga', 'mangadex'])}
              >
                {t('btn_reset')}
              </button>
              <button className="iconbtn" onClick={() => setOpenPanel('none')}>
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
          <div className="chips" style={{ marginBottom: 0 }}>
            {visibleSources.map((s) => {
              const on = selectedSources.includes(s.id);
              return (
                <button
                  key={s.id}
                  className={'chip' + (on ? ' on' : '')}
                  onClick={() => toggleSource(s.id)}
                >
                  {on && <Icon name="check" size={13} />} {s.name}
                  {s.isHentaiSource ? ' (Hentai)' : s.isAdultSource ? ' (18+)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Активные теги выбранных жанров (для быстрого снятия) */}
      {selectedGenres.length > 0 && openPanel !== 'genres' && (
        <div className="chips" style={{ marginTop: 4 }}>
          {selectedGenres.map((gid) => {
            const g = GENRES.find((x) => x.id === gid);
            if (!g) return null;
            return (
              <button key={gid} className="chip on" onClick={() => toggleGenre(gid)}>
                {uiLang === 'en' ? g.nameEn : g.name} ×
              </button>
            );
          })}
          <button className="chip" onClick={() => setSelectedGenres([])}>
            {t('btn_reset')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="h">
          {submittedQ
            ? `${t('heading_search')}: «${submittedQ}»`
            : sort === 'rating'
            ? t('sort_rating')
            : sort === 'new'
            ? t('sort_new')
            : sort === 'chapters'
            ? t('sort_chapters')
            : t('sort_popular')}
        </h2>
        {(selectedGenres.length > 0 || kind !== 'all' || submittedQ) && (
          <button className="btn small-btn" onClick={resetAllFilters}>
            {t('btn_reset')}
          </button>
        )}
      </div>

      {errs.map((e, i) => (
        <div key={i} className="err">
          {e}
        </div>
      ))}

      <MangaGrid items={items} onPick={nav.open} />

      {loading && <div className="muted center">{t('loading')}</div>}
      {!loading && items.length > 0 && (
        <div className="center">
          <button className="btn" onClick={() => load(page + 1, false)}>
            {t('load_more')}
          </button>
        </div>
      )}
      {!loading && items.length === 0 && !errs.length && (
        <div className="muted center">{t('nothing_found')}</div>
      )}
    </div>
  );
}
