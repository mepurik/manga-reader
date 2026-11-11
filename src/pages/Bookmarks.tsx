import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Nav } from '../App';
import { proxied } from '../lib/http';
import { getSource } from '../sources';
import { getDisplayTitle } from '../lib/i18n';
import Icon from '../components/Icon';

export default function Bookmarks({ nav }: { nav: Nav }) {
  const { bookmarks, removeBookmark, settings, uiLang, t } = useStore();
  const [q, setQ] = useState('');

  const open = async (b: (typeof bookmarks)[number]) => {
    const ch = await getSource(b.manga.sourceId).chapters(b.manga.id, settings.lang);
    const idx = ch.findIndex((c) => c.id === b.chapterId);
    nav.read(b.manga, ch, idx >= 0 ? idx : b.chapterIndex, b.page);
  };

  const filtered = q.trim()
    ? bookmarks.filter((b) => {
        const needle = q.trim().toLowerCase();
        return (
          getDisplayTitle(b.manga, uiLang).toLowerCase().includes(needle) ||
          b.manga.title.toLowerCase().includes(needle) ||
          b.chapterTitle.toLowerCase().includes(needle)
        );
      })
    : bookmarks;

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <h2 className="h" style={{ margin: 0 }}>
          {t('bm_title')} ({filtered.length})
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

      {bookmarks.length === 0 ? (
        <div className="panel muted">{t('bm_empty')}</div>
      ) : filtered.length === 0 ? (
        <div className="panel muted">{t('nothing_found')}</div>
      ) : (
        <div className="list">
          {filtered.map((b) => (
            <div key={b.id} className="panel row" onClick={() => open(b)} style={{ cursor: 'pointer' }}>
              {b.manga.cover && (
                <img className="hcover" src={proxied(b.manga.cover, b.manga.coverReferer)} />
              )}
              <div className="grow">
                <b>{getDisplayTitle(b.manga, uiLang)}</b>
                <div className="muted">
                  {b.chapterTitle} • {t('page_short')} {b.page + 1}
                </div>
                <div className="muted">{new Date(b.at).toLocaleString()}</div>
              </div>
              <button
                className="iconbtn"
                onClick={(e) => {
                  e.stopPropagation();
                  removeBookmark(b.id);
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
