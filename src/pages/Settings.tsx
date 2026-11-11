import {
  UPSCALE_OPTIONS,
  useStore,
  type AutoTranslateLang,
  type ReadMode,
  type UpscaleMode,
} from '../lib/store';
import type { ContentFilter, Lang, UILang } from '../sources/types';

export default function Settings() {
  const { settings, updateSettings, t } = useStore();
  const scrollSens = settings.scrollSensitivity ?? 1.0;
  const autoTr = settings.autoTranslate ?? 'off';

  return (
    <div style={{ maxWidth: 880 }}>
      <h2 className="h">{t('set_title')}</h2>

      <div className="panel settings-card">
        {/* Язык интерфейса и названий */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_ui_lang')}</div>
            <div className="setting-sub">{t('set_ui_lang_desc')}</div>
          </div>
          <div className="seg-group">
            {(['ru', 'en'] as UILang[]).map((l) => (
              <button
                key={l}
                className={'seg-btn' + ((settings.uiLang || 'ru') === l ? ' active' : '')}
                onClick={() => updateSettings({ uiLang: l })}
              >
                {l === 'ru' ? 'Русский (RU)' : 'English (EN)'}
              </button>
            ))}
          </div>
        </div>

        {/* Язык перевода глав */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_content_lang')}</div>
          </div>
          <div className="seg-group">
            {(['all', 'ru', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                className={'seg-btn' + (settings.lang === l ? ' active' : '')}
                onClick={() => updateSettings({ lang: l })}
              >
                {l === 'all' ? t('lang_all') : l === 'ru' ? t('lang_ru') : t('lang_en')}
              </button>
            ))}
          </div>
        </div>

        {/* Автоперевод страниц манги (OCR + Translate) */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_auto_translate')}</div>
            <div className="setting-sub">{t('set_auto_translate_desc')}</div>
          </div>
          <div className="seg-group">
            {(
              [
                { id: 'off', label: t('no') },
                { id: 'ru', label: 'RU' },
                { id: 'en', label: 'EN' },
                { id: 'es', label: 'ES' },
                { id: 'de', label: 'DE' },
              ] as { id: AutoTranslateLang; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                className={'seg-btn' + (autoTr === opt.id ? ' active' : '')}
                onClick={() => updateSettings({ autoTranslate: opt.id })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Чувствительность прокрутки колесика мыши */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_scroll_sens')}</div>
            <div className="setting-sub">{t('set_scroll_sens_desc')}</div>
          </div>
          <div className="scroll-sens-control">
            <input
              type="range"
              className="range-slider"
              min={0.2}
              max={3.0}
              step={0.1}
              value={scrollSens}
              onChange={(e) => updateSettings({ scrollSensitivity: Number(e.target.value) })}
            />
            <span className="sens-badge">{scrollSens.toFixed(1)}x</span>
            <div className="seg-group">
              {[0.5, 1.0, 1.5, 2.0].map((v) => (
                <button
                  key={v}
                  className={'seg-btn' + (Math.abs(scrollSens - v) < 0.05 ? ' active' : '')}
                  onClick={() => updateSettings({ scrollSensitivity: v })}
                >
                  {v.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Возрастной рейтинг 18+ */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_adult')}</div>
          </div>
          <div className="seg-group">
            {(['hide', 'allow', 'only'] as ContentFilter[]).map((v) => (
              <button
                key={v}
                className={'seg-btn' + ((settings.adult || 'allow') === v ? ' active' : '')}
                onClick={() => updateSettings({ adult: v })}
              >
                {v === 'hide' ? t('adult_hide') : v === 'allow' ? t('adult_allow') : t('adult_only')}
              </button>
            ))}
          </div>
        </div>

        {/* Хентай */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_hentai')}</div>
          </div>
          <div className="seg-group">
            {(['hide', 'allow', 'only'] as ContentFilter[]).map((v) => (
              <button
                key={v}
                className={'seg-btn' + ((settings.hentai || 'hide') === v ? ' active' : '')}
                onClick={() => updateSettings({ hentai: v })}
              >
                {v === 'hide' ? t('hentai_hide') : v === 'allow' ? t('hentai_allow') : t('hentai_only')}
              </button>
            ))}
          </div>
        </div>

        {/* Режим чтения */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_mode')}</div>
          </div>
          <div className="seg-group">
            {(['webtoon', 'single', 'double'] as ReadMode[]).map((m) => (
              <button
                key={m}
                className={'seg-btn' + (settings.mode === m ? ' active' : '')}
                onClick={() => updateSettings({ mode: m })}
              >
                {m === 'webtoon' ? t('mode_webtoon') : m === 'single' ? t('mode_single') : t('mode_double')}
              </button>
            ))}
          </div>
        </div>

        {/* Растягивать по ширине */}
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-title">{t('set_FitWidth')}</div>
          </div>
          <div className="seg-group">
            <button
              className={'seg-btn' + (settings.fitWidth ? ' active' : '')}
              onClick={() => updateSettings({ fitWidth: true })}
            >
              {t('yes')}
            </button>
            <button
              className={'seg-btn' + (!settings.fitWidth ? ' active' : '')}
              onClick={() => updateSettings({ fitWidth: false })}
            >
              {t('no')}
            </button>
          </div>
        </div>

        {/* Макс. ширина страницы */}
        <div className="setting-row" style={{ borderBottom: 0 }}>
          <div className="setting-info">
            <div className="setting-title">{t('set_MaxWidth')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              className="input number-input"
              type="number"
              min={500}
              max={1800}
              step={40}
              value={settings.maxWidth}
              onChange={(e) => updateSettings({ maxWidth: Number(e.target.value) || 920 })}
            />
            <div className="seg-group">
              {[760, 920, 1120, 1400].map((w) => (
                <button
                  key={w}
                  className={'seg-btn' + (settings.maxWidth === w ? ' active' : '')}
                  onClick={() => updateSettings({ maxWidth: w })}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <h3>{t('set_upscale_title')}</h3>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        {t('set_upscale_desc')}
      </p>
      <div className="list">
        {UPSCALE_OPTIONS.map((o) => {
          const active = (settings.upscale || 'rust_manga_hq') === o.id;
          return (
            <div
              key={o.id}
              className={'panel row upscale-card' + (active ? ' active' : '')}
              onClick={() => updateSettings({ upscale: o.id as UpscaleMode })}
            >
              <div className="grow">
                <b>{t(o.labelKey)}</b>
                <div className="muted" style={{ marginTop: 3 }}>
                  {t(o.descKey)}
                </div>
              </div>
              <span className={'radio-dot' + (active ? ' on' : '')} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
