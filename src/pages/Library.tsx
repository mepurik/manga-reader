import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Nav } from '../App';
import MangaGrid from '../components/MangaGrid';
import Icon from '../components/Icon';
import { getDisplayTitle } from '../lib/i18n';

export default function Library({ nav }: { nav: Nav }) {
  const { library, toggleLibrary, uiLang, t } = useStore();
  const [q, setQ] = useState('');

  const filtered = q.trim()
    ? library.filter((m) => {
        const needle = q.trim().toLowerCase();
        return (
          getDisplayTitle(m, uiLang).toLowerCase().includes(needle) ||
          m.title.toLowerCase().includes(needle) ||
          m.altTitles?.some((a) => a.toLowerCase().includes(needle))
        );
      })
    : library;

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <h2 className="h" style={{ margin: 0 }}>
          {t('nav_library')} ({filtered.length})
        </h2>
        <div className="searchbox" style={{ maxWidth: 340 }}>
          <Icon name="search" size={18} />
          <input
            type="text"
            placeholder={t('tab_search_placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="clearbtn" onClick={() => setQ('')}>
              ×
            </button>
          )}
        </div>
      </div>

      {library.length === 0 ? (
        <div className="panel muted">{t('lib_empty')}</div>
      ) : filtered.length === 0 ? (
        <div className="panel muted">{t('nothing_found')}</div>
      ) : (
        <MangaGrid items={filtered} onPick={nav.open} onRemove={toggleLibrary} />
      )}
    </div>
  );
}
