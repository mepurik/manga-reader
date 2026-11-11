import { useEffect, useState } from 'react';
import { getSource, sources } from '../sources';
import type { Chapter, Lang, Manga } from '../sources/types';
import type { Nav } from '../App';
import { downloadChapterToDisk, openDownloadsFolder, proxied, translateTextApi } from '../lib/http';
import { mTitleKey, useStore } from '../lib/store';
import { getDisplayTitle, getSubtitle } from '../lib/i18n';
import Icon from '../components/Icon';

const str = (v: any): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

const normTitle = (s?: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim();

const titlesMatch = (a?: string, b?: string) => {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return false;
  return na === nb || (na.length >= 5 && nb.length >= 5 && (na.includes(nb) || nb.includes(na)));
};

interface SiteEntry {
  sourceId: string;
  sourceName: string;
  manga: Manga;
  chapters?: Chapter[];
  loadingChapters?: boolean;
}

export default function Detail({ manga, nav }: { manga: Manga; nav: Nav }) {
  const {
    inLibrary,
    toggleLibrary,
    history,
    settings,
    uiLang,
    t,
    isChapterRead,
    toggleChapterRead,
    markAllChapters,
    isChapterDownloaded,
    markChapterDownloaded,
  } = useStore();

  const initialSites = (): SiteEntry[] => {
    const vars = manga.variants?.length ? manga.variants : [manga];
    const seen = new Set<string>();
    const list: SiteEntry[] = [];
    for (const v of vars) {
      if (seen.has(v.sourceId)) continue;
      seen.add(v.sourceId);
      list.push({
        sourceId: v.sourceId,
        sourceName: getSource(v.sourceId).name,
        manga: v,
      });
    }
    return list;
  };

  const [sites, setSites] = useState<SiteEntry[]>(initialSites);
  const [activeSourceId, setActiveSourceId] = useState<string>(manga.sourceId);
  const [info, setInfo] = useState<Manga>(manga);
  const [lang, setLang] = useState<Lang>(settings.lang);
  const [searchingSites, setSearchingSites] = useState(false);
  const [err, setErr] = useState('');

  // Chapter search filter
  const [chapQuery, setChapQuery] = useState('');

  // Description translation state
  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null);
  const [translatingDesc, setTranslatingDesc] = useState(false);

  // Download states
  const [downloadingIds, setDownloadingIds] = useState<Record<string, boolean>>({});
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');

  const activeSite = sites.find((s) => s.sourceId === activeSourceId) || sites[0];
  const chapters = activeSite?.chapters || [];
  const loadingChapters = Boolean(activeSite?.loadingChapters);

  useEffect(() => {
    let cancelled = false;
    const baseSites = initialSites();
    setSites(baseSites);
    setActiveSourceId(manga.sourceId);
    setInfo(manga);
    setTranslatedDesc(null);

    (async () => {
      setSearchingSites(true);
      const queries = Array.from(
        new Set([manga.title, ...(manga.altTitles || [])].map((s) => s?.trim()).filter(Boolean)),
      ).slice(0, 2) as string[];

      const existingIds = new Set(baseSites.map((s) => s.sourceId));
      const otherSources = sources.filter(
        (s) => !existingIds.has(s.id) && (!s.isHentaiSource || settings.hentai !== 'hide'),
      );

      await Promise.allSettled(
        otherSources.map(async (s) => {
          for (const q of queries) {
            try {
              const found = await s.search(q, 1, {
                lang,
                adult: settings.adult,
                hentai: settings.hentai,
              });
              const match = found.find(
                (cand) =>
                  titlesMatch(cand.title, q) ||
                  cand.altTitles?.some((alt) => titlesMatch(alt, q)),
              );
              if (match && !cancelled) {
                setSites((prev) => {
                  if (prev.some((x) => x.sourceId === s.id)) return prev;
                  return [
                    ...prev,
                    {
                      sourceId: s.id,
                      sourceName: s.name,
                      manga: match,
                    },
                  ];
                });
                break;
              }
            } catch {}
          }
        }),
      );
      if (!cancelled) setSearchingSites(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [manga.sourceId, manga.id]);

  useEffect(() => {
    let cancelled = false;
    const site = sites.find((s) => s.sourceId === activeSourceId);
    if (!site) return;

    const src = getSource(site.sourceId);
    setErr('');
    setTranslatedDesc(null);

    src
      .detail(site.manga.id)
      .then((d) => {
        if (cancelled) return;
        setInfo((prev) => ({
          ...prev,
          ...d,
          title: str(d.title) || prev.title,
          altTitles: Array.from(new Set([...(prev.altTitles || []), ...(d.altTitles || [])])),
          cover: str(d.cover) || prev.cover,
          description: str(d.description) || prev.description,
          author: str(d.author) || prev.author,
          status: str(d.status) || prev.status,
          rating: d.rating || prev.rating,
          tags: Array.isArray(d.tags) && d.tags.length ? d.tags.map(str).filter(Boolean) : prev.tags,
          variants: sites.map((s) => s.manga),
        }));
      })
      .catch(() => {});

    setSites((prev) =>
      prev.map((s) => (s.sourceId === site.sourceId ? { ...s, loadingChapters: true } : s)),
    );

    src
      .chapters(site.manga.id, lang)
      .then((chList) => {
        if (cancelled) return;
        setSites((prev) =>
          prev.map((s) =>
            s.sourceId === site.sourceId ? { ...s, chapters: chList, loadingChapters: false } : s,
          ),
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e?.message || String(e));
        setSites((prev) =>
          prev.map((s) => (s.sourceId === site.sourceId ? { ...s, chapters: [], loadingChapters: false } : s)),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [activeSourceId, lang, sites.length]);

  const activeManga: Manga = {
    ...info,
    sourceId: activeSite?.sourceId || manga.sourceId,
    id: activeSite?.manga.id || manga.id,
    variants: sites.map((s) => s.manga),
  };

  const saved = inLibrary(activeManga);
  const last = history.find((h) => mTitleKey(h.manga) === mTitleKey(activeManga));
  const lastIdx = last ? chapters.findIndex((c) => c.id === last.chapterId) : -1;

  const readCount = chapters.filter((c) => isChapterRead(activeManga, c)).length;

  const nextUnreadIdx = (() => {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (!isChapterRead(activeManga, chapters[i])) return i;
    }
    return lastIdx >= 0 ? lastIdx : chapters.length - 1;
  })();

  const handleTranslateDesc = async () => {
    if (!activeManga.description) return;
    if (translatedDesc) {
      setTranslatedDesc(null);
      return;
    }
    setTranslatingDesc(true);
    try {
      const tr = await translateTextApi(str(activeManga.description), uiLang);
      setTranslatedDesc(tr);
    } catch {}
    setTranslatingDesc(false);
  };

  const handleDownloadChapter = async (ch: Chapter) => {
    if (downloadingIds[ch.id]) return;
    setDownloadingIds((prev) => ({ ...prev, [ch.id]: true }));
    try {
      const src = getSource(activeManga.sourceId);
      const pages = await src.pages(ch.id);
      if (pages.length > 0) {
        const res = await downloadChapterToDisk(
          getDisplayTitle(activeManga, uiLang),
          ch.title || `Ch_${ch.number || ch.id}`,
          pages,
          settings.upscale,
        );
        if (res.ok) {
          markChapterDownloaded(activeManga, ch, res.dir);
        }
      }
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setDownloadingIds((prev) => ({ ...prev, [ch.id]: false }));
    }
  };

  const handleDownloadAll = async () => {
    if (downloadingAll || !chapters.length) return;
    setDownloadingAll(true);
    const ordered = [...chapters].reverse();
    for (let i = 0; i < ordered.length; i++) {
      const ch = ordered[i];
      setDownloadProgress(`${i + 1} / ${ordered.length}`);
      if (!isChapterDownloaded(activeManga, ch)) {
        await handleDownloadChapter(ch);
      }
    }
    setDownloadProgress('');
    setDownloadingAll(false);
  };

  const displayTitle = getDisplayTitle(activeManga, uiLang);
  const subtitle = getSubtitle(activeManga, uiLang);

  const visibleChapters = chapQuery.trim()
    ? chapters
        .map((c, idx) => ({ c, idx }))
        .filter(({ c }) => {
          const needle = chapQuery.trim().toLowerCase();
          return (
            str(c.title).toLowerCase().includes(needle) ||
            str(c.number).toLowerCase().includes(needle)
          );
        })
    : chapters.map((c, idx) => ({ c, idx }));

  return (
    <div>
      <button className="btn" onClick={nav.back}>
        <Icon name="back" size={16} /> {t('back')}
      </button>

      <div className="panel source-switcher">
        <div className="source-switcher-label">
          <Icon name="globe" size={18} />
          <span>{t('source_select_label')}</span>
        </div>
        <div className="chips" style={{ marginBottom: 0 }}>
          {sites.map((s) => {
            const isCurrent = s.sourceId === activeSourceId;
            return (
              <button
                key={s.sourceId}
                className={'chip' + (isCurrent ? ' on' : '')}
                onClick={() => setActiveSourceId(s.sourceId)}
              >
                {s.sourceName}
                {s.chapters !== undefined ? ` (${s.chapters.length})` : ''}
              </button>
            );
          })}
          {searchingSites && <span className="muted" style={{ alignSelf: 'center' }}>{t('searching_sources')}</span>}
        </div>
      </div>

      <div className="detail panel">
        {activeManga.cover && (
          <img className="dcover" src={proxied(activeManga.cover, activeManga.coverReferer)} alt={displayTitle} />
        )}
        <div className="dinfo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{displayTitle}</h1>
            {activeManga.rating && activeManga.rating > 0 ? (
              <span className="rating-pill">
                <Icon name="star" size={15} /> {activeManga.rating.toFixed(1)}
              </span>
            ) : null}
            {activeManga.isHentai ? (
              <span className="tag nsfw-tag">HENTAI</span>
            ) : activeManga.isAdult ? (
              <span className="tag adult-tag">18+</span>
            ) : null}
          </div>
          {subtitle && <div className="muted" style={{ marginTop: 4 }}>{subtitle}</div>}

          <div className="muted" style={{ marginTop: 6 }}>
            {[str(activeManga.author), str(activeManga.status), getSource(activeManga.sourceId).name]
              .filter(Boolean)
              .join(' • ')}
          </div>

          {activeManga.tags && activeManga.tags.length > 0 && (
            <div className="tags">
              {activeManga.tags.slice(0, 14).map((tg, idx) => (
                <span key={`${tg}-${idx}`} className="tag">
                  {str(tg)}
                </span>
              ))}
            </div>
          )}

          {activeManga.description && (
            <div>
              <p className="desc">{translatedDesc || str(activeManga.description)}</p>
              <button
                className="btn small-btn"
                onClick={handleTranslateDesc}
                disabled={translatingDesc}
                style={{ marginBottom: 8 }}
              >
                <Icon name="globe" size={14} />{' '}
                {translatingDesc
                  ? t('loading')
                  : translatedDesc
                  ? t('btn_show_orig_desc')
                  : t('btn_translate_desc')}
              </button>
            </div>
          )}

          <div className="actions">
            <button
              className={'btn' + (saved ? ' primary' : '')}
              onClick={() => toggleLibrary(activeManga)}
            >
              <Icon name="star" size={16} /> {saved ? t('in_library') : t('add_to_library')}
            </button>

            {chapters.length > 0 && (
              <button
                className="btn primary"
                onClick={() =>
                  nav.read(
                    activeManga,
                    chapters,
                    lastIdx >= 0 ? lastIdx : nextUnreadIdx,
                    lastIdx >= 0 ? last?.page : undefined,
                  )
                }
              >
                <Icon name="book" size={16} />{' '}
                {lastIdx >= 0
                  ? `${t('continue_reading')} (${last!.chapterTitle})`
                  : readCount > 0 && nextUnreadIdx >= 0
                  ? `${t('continue_reading')} (${chapters[nextUnreadIdx].title})`
                  : t('start_reading')}
              </button>
            )}

            {chapters.length > 0 && (
              <button className="btn" onClick={handleDownloadAll} disabled={downloadingAll}>
                <Icon name="download" size={16} />{' '}
                {downloadingAll ? `${t('downloading')} (${downloadProgress})` : t('download_all')}
              </button>
            )}

            <button className="btn" onClick={() => openDownloadsFolder()}>
              <Icon name="folder" size={16} /> {t('open_downloads')}
            </button>

            <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="all">{t('lang_all')}</option>
              <option value="ru">{t('lang_ru')}</option>
              <option value="en">{t('lang_en')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="chapters-header">
        <h3 style={{ margin: 0 }}>
          {t('chapters_title')} ({chapters.length})
          {chapters.length > 0 && (
            <span className="muted" style={{ fontWeight: 400, marginLeft: 10 }}>
              • {t('read_progress')}: {readCount} / {chapters.length}
            </span>
          )}
        </h3>
        {chapters.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="searchbox" style={{ maxWidth: 260 }}>
              <Icon name="search" size={16} />
              <input
                type="text"
                placeholder={t('ch_search_placeholder')}
                value={chapQuery}
                onChange={(e) => setChapQuery(e.target.value)}
              />
              {chapQuery && (
                <button className="clearbtn" onClick={() => setChapQuery('')}>
                  ×
                </button>
              )}
            </div>
            <button
              className="btn small-btn"
              onClick={() => markAllChapters(activeManga, chapters, true)}
            >
              <Icon name="check" size={14} /> {t('mark_all_read')}
            </button>
            {readCount > 0 && (
              <button
                className="btn small-btn"
                onClick={() => markAllChapters(activeManga, chapters, false)}
              >
                {t('mark_all_unread')}
              </button>
            )}
          </div>
        )}
      </div>

      {err && <div className="err">{err}</div>}
      {loadingChapters && <div className="muted center">{t('loading')}</div>}

      {!loadingChapters && chapters.length === 0 && !err && (
        <div className="panel muted center">{t('no_chapters_in_source')}</div>
      )}

      <div className="chapters">
        {visibleChapters.map(({ c, idx: i }) => {
          const isRead = isChapterRead(activeManga, c);
          const dlPath = isChapterDownloaded(activeManga, c);
          const isDlBusy = Boolean(downloadingIds[c.id]);

          return (
            <div
              key={c.id}
              className={'ch' + (isRead ? ' ch-read' : '')}
              onClick={() => nav.read(activeManga, chapters, i)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <button
                  className={'read-check-btn' + (isRead ? ' on' : '')}
                  title={t('mark_read_title')}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleChapterRead(activeManga, c);
                  }}
                >
                  <Icon name="check" size={14} />
                </button>
                <span className="ch-title-text">{str(c.title)}</span>
                {isRead && <span className="ch-badge read">{t('read_badge')}</span>}
                {dlPath && (
                  <span
                    className="ch-badge dl"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDownloadsFolder(dlPath);
                    }}
                  >
                    {t('downloaded_badge')}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {!isRead && i < chapters.length - 1 && (
                  <button
                    className="ch-action-btn"
                    title={t('mark_up_to_here')}
                    onClick={(e) => {
                      e.stopPropagation();
                      const slice = chapters.slice(i);
                      for (const item of slice) toggleChapterRead(activeManga, item, true);
                    }}
                  >
                    ↓ {t('read_badge')}
                  </button>
                )}
                <button
                  className="ch-action-btn"
                  title={t('download_chapter')}
                  disabled={isDlBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dlPath) openDownloadsFolder(dlPath);
                    else handleDownloadChapter(c);
                  }}
                >
                  <Icon name={dlPath ? 'folder' : 'download'} size={15} />
                  {isDlBusy ? '...' : ''}
                </button>
                <span className="muted" style={{ minWidth: 75, textAlign: 'right' }}>
                  {str(c.date)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
