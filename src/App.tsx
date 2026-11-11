import { useEffect, useRef, useState } from 'react';
import type { Chapter, Manga } from './sources/types';
import Browse from './pages/Browse';
import Library from './pages/Library';
import History from './pages/History';
import Settings from './pages/Settings';
import Detail from './pages/Detail';
import Reader from './pages/Reader';
import Bookmarks from './pages/Bookmarks';
import Stats from './pages/Stats';
import Profiles from './pages/Profiles';
import Icon from './components/Icon';
import ErrorBoundary from './components/ErrorBoundary';
import { useStore } from './lib/store';
import type { I18nKey } from './lib/i18n';

export type Tab = 'browse' | 'library' | 'bookmarks' | 'history' | 'stats' | 'profiles' | 'settings';

export type View =
  | { t: 'tab' }
  | { t: 'detail'; manga: Manga }
  | { t: 'reader'; manga: Manga; chapters: Chapter[]; index: number; page?: number };

export interface Nav {
  open(m: Manga): void;
  read(m: Manga, chapters: Chapter[], index: number, page?: number): void;
  back(): void;
}

const tabs: { id: Tab; labelKey: I18nKey; icon: string }[] = [
  { id: 'browse', labelKey: 'nav_browse', icon: 'home' },
  { id: 'library', labelKey: 'nav_library', icon: 'library' },
  { id: 'bookmarks', labelKey: 'nav_bookmarks', icon: 'bookmark' },
  { id: 'history', labelKey: 'nav_history', icon: 'history' },
  { id: 'stats', labelKey: 'nav_stats', icon: 'stats' },
  { id: 'profiles', labelKey: 'nav_profiles', icon: 'person' },
  { id: 'settings', labelKey: 'nav_settings', icon: 'settings' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('browse');
  const [stack, setStack] = useState<View[]>([{ t: 'tab' }]);
  const { profile, stats, settings, uiLang, updateSettings, t } = useStore();
  const mainRef = useRef<HTMLElement>(null);
  const view = stack[stack.length - 1];
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = stats.days[todayKey];

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const sens = settings.scrollSensitivity ?? 1.0;
    if (Math.abs(sens - 1.0) < 0.05) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      // Do not hijack scroll inside nested scrollable elements (like description)
      const target = e.target as HTMLElement | null;
      if (target && target !== el && target.closest('.desc, .suggest-dropdown')) return;
      e.preventDefault();
      el.scrollTop += e.deltaY * sens;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [settings.scrollSensitivity, view.t]);

  const fmtTime = (sec: number) => {
    const m = Math.round(sec / 60);
    return m >= 60 ? `${Math.floor(m / 60)} ${t('time_h')} ${m % 60} ${t('time_m')}` : `${m} ${t('time_m')}`;
  };

  const push = (v: View) => setStack((s) => [...s, v]);
  const nav: Nav = {
    open: (manga) => push({ t: 'detail', manga }),
    read: (manga, chapters, index, page) => push({ t: 'reader', manga, chapters, index, page }),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
  };

  if (view.t === 'reader')
    return (
      <ErrorBoundary onReset={nav.back}>
        <Reader
          key={view.chapters[view.index].id}
          manga={view.manga}
          chapters={view.chapters}
          index={view.index}
          startPage={view.page}
          nav={nav}
          onChapter={(i) => setStack((s) => [...s.slice(0, -1), { ...(s[s.length - 1] as any), index: i, page: undefined }])}
        />
      </ErrorBoundary>
    );

  const profileInitial = (profile.name || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 256 256" style={{ flexShrink: 0 }} aria-hidden>
            <defs>
              <linearGradient id="mMain" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c382ff" />
                <stop offset="100%" stopColor="#7337f5" />
              </linearGradient>
              <linearGradient id="mDark" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#8246eb" />
                <stop offset="100%" stopColor="#501eb9" />
              </linearGradient>
              <linearGradient id="mAcc" x1="0" y1="0" x2="1" y2="0.5">
                <stop offset="0%" stopColor="#e1afff" />
                <stop offset="100%" stopColor="#9b55ff" />
              </linearGradient>
            </defs>
            <polygon points="26,226 74,30 112,30 134,118 106,142 88,76 64,226" fill="url(#mMain)" />
            <polygon points="178,164 214,146 230,226 190,226" fill="url(#mDark)" />
            <polygon points="152,30 190,30 210,112 240,128 96,196 124,138 174,114" fill="url(#mAcc)" />
          </svg>
          <span className="logotext">MangaReader</span>
        </div>

        <nav>
          {tabs.map((x) => (
            <button
              key={x.id}
              className={'navbtn' + (tab === x.id && view.t === 'tab' ? ' active' : '')}
              onClick={() => {
                setTab(x.id);
                setStack([{ t: 'tab' }]);
              }}
            >
              <span className="navicon">
                <Icon name={x.icon} />
              </span>
              {t(x.labelKey)}
            </button>
          ))}
        </nav>

        <div className="spacer" />

        {/* Быстрый переключатель языка интерфейса и названий RU / EN */}
        <div className="lang-switch">
          <button
            className={'lang-btn' + (uiLang === 'ru' ? ' active' : '')}
            onClick={() => updateSettings({ uiLang: 'ru' })}
          >
            RU
          </button>
          <button
            className={'lang-btn' + (uiLang === 'en' ? ' active' : '')}
            onClick={() => updateSettings({ uiLang: 'en' })}
          >
            EN
          </button>
        </div>

        <div className="widget">
          <div className="wlabel">{t('widget_today')}</div>
          <div className="wrow">
            <span className="wicon-label">
              <Icon name="clock" size={14} /> {t('widget_time')}
            </span>
            <b>{fmtTime(today?.sec || 0)}</b>
          </div>
          <div className="wrow">
            <span className="wicon-label">
              <Icon name="file" size={14} /> {t('widget_pages')}
            </span>
            <b>{today?.pages || 0}</b>
          </div>
        </div>

        <div className="widget">
          <div className="wlabel">{t('widget_total')}</div>
          <div className="wrow">
            <span className="wicon-label">
              <Icon name="book" size={14} /> {t('widget_chapters')}
            </span>
            <b>{stats.chapters}</b>
          </div>
          <div className="wrow">
            <span className="wicon-label">
              <Icon name="clock" size={14} /> {t('widget_time')}
            </span>
            <b>{fmtTime(stats.seconds)}</b>
          </div>
        </div>

        <button
          className="profilechip"
          onClick={() => {
            setTab('profiles');
            setStack([{ t: 'tab' }]);
          }}
        >
          <span className="avatar">
            {profile.avatar ? <img src={profile.avatar} alt={profile.name} /> : profileInitial}
          </span>
          <span className="profilename">{profile.name}</span>
        </button>
      </aside>

      <main ref={mainRef} className="content">
        <ErrorBoundary key={view.t === 'detail' ? view.manga.sourceId + view.manga.id : tab} onReset={nav.back}>
          {view.t === 'detail' ? (
            <Detail manga={view.manga} nav={nav} />
          ) : (
            <>
              <div style={{ display: tab === 'browse' ? 'block' : 'none' }}>
                <Browse nav={nav} />
              </div>
              {tab === 'library' && <Library nav={nav} />}
              {tab === 'bookmarks' && <Bookmarks nav={nav} />}
              {tab === 'history' && <History nav={nav} />}
              {tab === 'stats' && <Stats />}
              {tab === 'profiles' && <Profiles />}
              {tab === 'settings' && <Settings />}
            </>
          )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
