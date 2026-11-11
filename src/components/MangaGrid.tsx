import type { Manga } from '../sources/types';
import { getSource } from '../sources';
import { proxied } from '../lib/http';
import { useStore } from '../lib/store';
import { getDisplayTitle } from '../lib/i18n';
import Icon from './Icon';

export default function MangaGrid({
  items,
  onPick,
  onRemove,
}: {
  items: Manga[];
  onPick: (m: Manga) => void;
  onRemove?: (m: Manga) => void;
}) {
  const { uiLang } = useStore();

  return (
    <div className="grid">
      {items.map((m) => {
        const extraSources = (m.variants?.length || 1) - 1;
        const srcLabel = getSource(m.sourceId).name + (extraSources > 0 ? ` +${extraSources}` : '');
        const displayTitle = getDisplayTitle(m, uiLang);

        return (
          <div key={`${m.sourceId}:${m.id}`} className="card" onClick={() => onPick(m)}>
            <div className="cover">
              {m.cover && <img src={proxied(m.cover, m.coverReferer)} loading="lazy" alt={displayTitle} />}
              <span className="badge">{srcLabel}</span>
              {m.isHentai ? (
                <span className="badge nsfw">HENTAI</span>
              ) : m.isAdult ? (
                <span className="badge adult">18+</span>
              ) : null}
              {m.rating && m.rating > 0 ? (
                <span className="badge rate">
                  <Icon name="star" size={12} /> {m.rating.toFixed(1)}
                </span>
              ) : null}
              {onRemove && (
                <button
                  className="cardremove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(m);
                  }}
                >
                  ×
                </button>
              )}
            </div>
            <div className="ctitle" title={displayTitle}>
              {displayTitle}
            </div>
          </div>
        );
      })}
    </div>
  );
}
