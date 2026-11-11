import { useEffect, useRef, useState } from 'react';
import { getSource } from '../sources';
import type { Chapter, Manga, Page } from '../sources/types';
import type { Nav } from '../App';
import { proxied, translatePageApi, type TranslatedBubble } from '../lib/http';
import {
  mkey,
  UPSCALE_OPTIONS,
  useStore,
  type AutoTranslateLang,
  type ReadMode,
  type UpscaleMode,
} from '../lib/store';
import { getDisplayTitle } from '../lib/i18n';
import Icon from '../components/Icon';

function PageWithTranslation({
  pageItem,
  upscale,
  autoTranslate,
  maxWidthStyle,
  widthStyle,
  maxHeightStyle,
  imgFilter,
  translatingLabel,
}: {
  pageItem: Page;
  upscale: UpscaleMode;
  autoTranslate: AutoTranslateLang;
  maxWidthStyle: string;
  widthStyle: string;
  maxHeightStyle?: string;
  imgFilter?: string;
  translatingLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [bubbles, setBubbles] = useState<TranslatedBubble[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { rootMargin: '600px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (autoTranslate === 'off' || !inView) {
      if (autoTranslate === 'off') setBubbles([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    translatePageApi(pageItem.url, pageItem.referer, autoTranslate)
      .then((res) => {
        if (!cancelled) setBubbles(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageItem.url, autoTranslate, inView]);

  return (
    <div
      ref={wrapRef}
      className="page-wrap"
      style={{
        maxWidth: maxWidthStyle,
        width: widthStyle,
      }}
    >
      <img
        src={proxied(pageItem.url, pageItem.referer, upscale)}
        loading="lazy"
        style={{
          width: '100%',
          maxHeight: maxHeightStyle,
          display: 'block',
          objectFit: 'contain',
          filter: imgFilter,
        }}
      />
      {busy && autoTranslate !== 'off' && (
        <div className="ocr-status-pill">{translatingLabel}</div>
      )}
      {autoTranslate !== 'off' &&
        bubbles.map((b, idx) => (
          <div
            key={idx}
            className="ocr-bubble"
            title={b.original}
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              minHeight: `${b.h}%`,
            }}
          >
            <span>{b.translated}</span>
          </div>
        ))}
    </div>
  );
}

export default function Reader({
  manga,
  chapters,
  index,
  startPage = 0,
  nav,
  onChapter,
}: {
  manga: Manga;
  chapters: Chapter[];
  index: number;
  startPage?: number;
  nav: Nav;
  onChapter: (i: number) => void;
}) {
  const {
    settings,
    updateSettings,
    recordHistory,
    recordStats,
    bookmarks,
    toggleBookmark,
    toggleChapterRead,
    uiLang,
    t,
  } = useStore();
  const ch = chapters[index];

  const [pages, setPages] = useState<Page[]>([]);
  const [page, setPage] = useState(startPage);
  const [mode, setMode] = useState<ReadMode>(settings.mode);
  const [upscale, setUpscale] = useState<UpscaleMode>(settings.upscale || 'rust_manga_hq');
  const [autoTranslate, setAutoTranslate] = useState<AutoTranslateLang>(settings.autoTranslate || 'off');
  const [bar, setBar] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const seenPages = useRef(new Set<number>());

  useEffect(() => {
    setLoading(true);
    setErr('');
    setPages([]);
    setPage(startPage);
    seenPages.current.clear();

    toggleChapterRead(manga, ch, true);

    getSource(manga.sourceId)
      .pages(ch.id)
      .then((list) => {
        setPages(list);
        recordStats(manga, 1, 0, 1);
        seenPages.current.add(startPage);
        if (startPage > 0 && mode === 'webtoon') {
          setTimeout(() => {
            const imgs = scroller.current?.querySelectorAll('img');
            imgs?.[startPage]?.scrollIntoView();
          }, 150);
        }
      })
      .catch((e) => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [ch.id]);

  // Custom mouse wheel sensitivity handler
  useEffect(() => {
    const el = scroller.current;
    if (!el || mode !== 'webtoon') return;
    const sens = settings.scrollSensitivity ?? 1.0;
    if (Math.abs(sens - 1.0) < 0.05) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      el.scrollTop += e.deltaY * sens;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mode, settings.scrollSensitivity]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hasFocus()) recordStats(manga, 0, 5, 0);
    }, 5000);
    return () => clearInterval(timer);
  }, [ch.id]);

  useEffect(() => {
    if (!pages.length) return;
    recordHistory({ manga, chapterId: ch.id, chapterTitle: ch.title, page, at: Date.now() });
    if (!seenPages.current.has(page)) {
      seenPages.current.add(page);
      recordStats(manga, 1, 0, 0);
    }
  }, [page, pages.length]);

  const step = mode === 'double' ? 2 : 1;
  const prevChapter = () => index < chapters.length - 1 && onChapter(index + 1);
  const nextChapter = () => index > 0 && onChapter(index - 1);

  const prev = () => (page - step >= 0 ? setPage(page - step) : prevChapter());
  const next = () => (page + step < pages.length ? setPage(page + step) : nextChapter());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'webtoon') {
        if (e.key === 'ArrowRight' || e.key === ' ') next();
        if (e.key === 'ArrowLeft') prev();
      }
      if (e.key === 'Escape') nav.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const bookmarked = bookmarks.some((b) => b.id === `${mkey(manga)}:${ch.id}:${page}`);
  const imgFilter =
    upscale === 'anime4k'
      ? 'url(#anime4k-shader) contrast(1.06)'
      : upscale === 'rust_ink'
      ? 'url(#ink-shader) contrast(1.18) brightness(1.03)'
      : undefined;

  return (
    <div className="reader">
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <filter id="anime4k-shader" colorInterpolationFilters="sRGB">
            <feConvolveMatrix
              order="3 3"
              preserveAlpha="true"
              kernelMatrix="0 -0.45 0 -0.45 2.8 -0.45 0 -0.45 0"
            />
          </filter>
          <filter id="ink-shader" colorInterpolationFilters="sRGB">
            <feConvolveMatrix
              order="3 3"
              preserveAlpha="true"
              kernelMatrix="0 -0.35 0 -0.35 2.4 -0.35 0 -0.35 0"
            />
          </filter>
        </defs>
      </svg>

      <div className={'rbar' + (bar ? '' : ' hidden')}>
        <button className="btn" onClick={nav.back}>
          <Icon name="back" size={16} /> {t('back')}
        </button>
        <div className="rtitle">
          {getDisplayTitle(manga, uiLang)} — {ch.title}
        </div>
        <span className="muted">
          {pages.length ? `${page + 1} / ${pages.length}` : ''}
        </span>

        {/* Автоперевод страниц (OCR + Google Translate) */}
        <select
          className="select"
          value={autoTranslate}
          onChange={(e) => {
            const v = e.target.value as AutoTranslateLang;
            setAutoTranslate(v);
            updateSettings({ autoTranslate: v });
          }}
        >
          <option value="off">{t('tr_off')}</option>
          <option value="ru">{t('tr_ru')}</option>
          <option value="en">{t('tr_en')}</option>
          <option value="es">{t('tr_es')}</option>
          <option value="de">{t('tr_de')}</option>
        </select>

        {/* Переключатель режима апскейлера */}
        <select
          className="select"
          value={upscale}
          onChange={(e) => {
            const v = e.target.value as UpscaleMode;
            setUpscale(v);
            updateSettings({ upscale: v });
          }}
        >
          {UPSCALE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={mode}
          onChange={(e) => setMode(e.target.value as ReadMode)}
        >
          <option value="webtoon">{t('mode_webtoon')}</option>
          <option value="single">{t('mode_single')}</option>
          <option value="double">{t('mode_double')}</option>
        </select>

        <button
          className={'btn' + (bookmarked ? ' primary' : '')}
          onClick={() =>
            toggleBookmark({
              manga,
              chapterId: ch.id,
              chapterTitle: ch.title,
              chapterIndex: index,
              page,
            })
          }
        >
          <Icon name="bookmark" size={15} /> {t('bookmark_btn')}
        </button>
        <button className="btn" disabled={index >= chapters.length - 1} onClick={prevChapter}>
          {t('prev_ch')}
        </button>
        <button className="btn" disabled={index <= 0} onClick={nextChapter}>
          {t('next_ch')}
        </button>
      </div>

      {loading && <div className="muted center" style={{ marginTop: 80 }}>{t('loading_pages')}</div>}
      {err && <div className="err" style={{ margin: 80 }}>{err}</div>}

      {mode === 'webtoon' ? (
        <div
          ref={scroller}
          className="scroller"
          onClick={() => setBar((b) => !b)}
          onScroll={(e) => {
            const el = e.currentTarget;
            const idx = Math.min(
              pages.length - 1,
              Math.floor((el.scrollTop / Math.max(1, el.scrollHeight)) * pages.length),
            );
            if (idx >= 0 && idx !== page) setPage(idx);
          }}
        >
          {pages.map((p, i) => (
            <PageWithTranslation
              key={`${i}-${upscale}`}
              pageItem={p}
              upscale={upscale}
              autoTranslate={autoTranslate}
              maxWidthStyle={settings.fitWidth ? `${settings.maxWidth}px` : 'none'}
              widthStyle={settings.fitWidth ? '100%' : 'auto'}
              imgFilter={imgFilter}
              translatingLabel={t('translating_page')}
            />
          ))}
          {pages.length > 0 && (
            <div className="center" style={{ padding: 40, display: 'flex', justifyContent: 'center', gap: 12 }}>
              <button className="btn" disabled={index >= chapters.length - 1} onClick={(e) => { e.stopPropagation(); prevChapter(); }}>
                {t('prev_ch')}
              </button>
              <button className="btn primary" disabled={index <= 0} onClick={(e) => { e.stopPropagation(); nextChapter(); }}>
                {t('next_ch')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className="paged"
          onClick={(e) => {
            const w = e.currentTarget.clientWidth;
            if (e.clientX < w * 0.35) prev();
            else if (e.clientX > w * 0.65) next();
            else setBar((b) => !b);
          }}
        >
          {pages.slice(page, page + step).map((p, i) => (
            <PageWithTranslation
              key={`${page + i}-${upscale}`}
              pageItem={p}
              upscale={upscale}
              autoTranslate={autoTranslate}
              maxWidthStyle={mode === 'double' ? '49%' : '100%'}
              widthStyle="auto"
              maxHeightStyle="100vh"
              imgFilter={imgFilter}
              translatingLabel={t('translating_page')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
