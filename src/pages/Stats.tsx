import { useStore } from '../lib/store';
import { proxied } from '../lib/http';

export default function Stats() {
  const { stats, t } = useStore();

  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h > 0 ? `${h} ${t('time_h')} ${m} ${t('time_m')}` : `${m} ${t('time_m')}`;
  };

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { label: key.slice(5), ...(stats.days[key] || { pages: 0, sec: 0 }) };
  });
  const maxPages = Math.max(10, ...days.map((d) => d.pages));
  const top = Object.values(stats.perManga)
    .sort((a, b) => b.pages - a.pages)
    .slice(0, 8);

  return (
    <div>
      <h2 className="h">{t('stats_title')}</h2>
      <div className="kpis">
        <div className="panel kpi">
          <div className="kpival">{stats.chapters}</div>
          <div className="muted">{t('stats_chapters')}</div>
        </div>
        <div className="panel kpi">
          <div className="kpival">{stats.pages}</div>
          <div className="muted">{t('stats_pages')}</div>
        </div>
        <div className="panel kpi">
          <div className="kpival">{fmtTime(stats.seconds)}</div>
          <div className="muted">{t('stats_time')}</div>
        </div>
      </div>

      <h3>{t('stats_activity')}</h3>
      <div className="panel chart">
        {days.map((d) => (
          <div key={d.label} className="bar">
            <div className="barfill" style={{ height: `${(d.pages / maxPages) * 100}%` }} title={`${d.pages}`} />
            <span>{d.label}</span>
          </div>
        ))}
      </div>

      <h3>{t('stats_top')}</h3>
      {top.length === 0 ? (
        <div className="panel muted">{t('stats_no_data')}</div>
      ) : (
        <div className="list">
          {top.map((m, i) => (
            <div key={i} className="panel toprow">
              <span className="rank">#{i + 1}</span>
              {m.cover && <img className="hcover" src={proxied(m.cover, m.coverReferer)} />}
              <div className="grow">
                <b>{m.title}</b>
                <div className="muted">
                  {m.pages} {t('widget_pages').toLowerCase()} • {fmtTime(m.sec)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
