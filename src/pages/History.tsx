import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Nav } from '../App';
import { proxied } from '../lib/http';
import { getDisplayTitle } from '../lib/i18n';
import Icon from '../components/Icon';

export default function History({ nav }: { nav: Nav }) {
  const { history, clearHistory, uiLang, t } = useStore();
  const [q, setQ] = useState('');

  const filtered = q.trim()
    ? history.filter((h) => {
        const needle = q.trim().toLowerCase();
        return (
          getDisplayTitle(h.manga, uiLang).toLowerCase().includes(needle) ||
          h.manga.title.toLowerCase().includes(needle) ||
          h.chapterTitle.toLowerCase().includes(needle)
        );
      })
    : history;

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <h2 className="h" style={{ margin: 0 }}>
          {t('hist_title')} ({filtered.length})
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="searchbox" style={{ maxWidth: 320 }}>
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
          {history.length > 0 && (
            <button className="btn" onClick={clearHistory}>
              {t('hist_clear')}
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="panel muted">{t('hist_empty')}</div>
      ) : filtered.length === 0 ? (
        <div className="panel muted">{t('nothing_found')}</div>
      ) : (
        <div className="list">
          {filtered.map((h) => (
            <div
              key={`${h.manga.sourceId}:${h.manga.id}`}
              className="panel row"
              style={{ cursor: 'pointer' }}
              onClick={() => nav.open(h.manga)}
            >
              {h.manga.cover && (
                <img className="hcover" src={proxied(h.manga.cover, h.manga.coverReferer)} />
              )}
              <div>
                <b>{getDisplayTitle(h.manga, uiLang)}</b>
                <div className="muted">
                  {h.chapterTitle} • {t('page_short')} {h.page + 1}
                </div>
                <div className="muted">{new Date(h.at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
