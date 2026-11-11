import type { Manga, UILang } from '../sources/types';

const DICT = {
  ru: {
    // Sidebar
    nav_browse: 'Обзор',
    nav_library: 'Библиотека',
    nav_bookmarks: 'Закладки',
    nav_history: 'История',
    nav_stats: 'Статистика',
    nav_profiles: 'Профили',
    nav_settings: 'Настройки',
    widget_today: 'Сегодня',
    widget_total: 'Всего',
    widget_time: 'Время',
    widget_pages: 'Страниц',
    widget_chapters: 'Глав',
    time_h: 'ч',
    time_m: 'мин',

    // Browse
    search_placeholder: 'Поиск манги, манхвы, маньхуа...',
    tab_search_placeholder: 'Фильтр по названию...',
    ch_search_placeholder: 'Поиск главы (например: 45)...',
    search_btn: 'Найти',
    search_suggestions: 'Быстрый переход к тайтлу',
    search_show_all: 'Показать все результаты по запросу',
    sort_popular: 'Популярное',
    sort_rating: 'По рейтингу',
    sort_new: 'Новинки',
    sort_chapters: 'Много глав',
    kind_all: 'Все форматы',
    kind_manga: 'Манга (JP)',
    kind_manhwa: 'Манхва (KR)',
    kind_manhua: 'Маньхуа (CN)',
    adult_hide: 'Скрыть 18+',
    adult_allow: 'Разрешить 18+',
    adult_only: 'Только 18+',
    hentai_hide: 'Скрыть хентай',
    hentai_allow: 'Разрешить хентай',
    hentai_only: 'Только хентай',
    lang_all: 'Все языки',
    lang_ru: 'Русский',
    lang_en: 'English',
    btn_genres: 'Жанры',
    btn_sources: 'Источники',
    btn_reset: 'Сбросить',
    select_all: 'Выбрать все',
    clear_selection: 'Очистить',
    heading_search: 'Результаты поиска',
    loading: 'Загрузка...',
    load_more: 'Загрузить ещё',
    nothing_found: 'Ничего не найдено по выбранным фильтрам',

    // Detail
    back: 'Назад',
    source_select_label: 'Источник манги:',
    searching_sources: 'поиск на других сайтах...',
    in_library: 'В избранном',
    add_to_library: 'В избранное',
    continue_reading: 'Продолжить',
    start_reading: 'Читать с начала',
    download_all: 'Скачать все главы',
    downloading: 'Скачивание...',
    open_downloads: 'Папка загрузок',
    btn_translate_desc: 'Перевести описание',
    btn_show_orig_desc: 'Показать оригинал',
    chapters_title: 'Главы',
    chapters_found_count: 'глав',
    read_progress: 'Прочитано',
    mark_all_read: 'Отметить все прочитанными',
    mark_all_unread: 'Сбросить прочитанные',
    mark_read_title: 'Отметить как прочитанную / непрочитанную',
    mark_up_to_here: 'Отметить прочитанными до этой главы',
    download_chapter: 'Скачать главу',
    downloaded_badge: 'Скачано',
    read_badge: 'Прочитано',
    no_chapters_in_source: 'На этом сайте нет доступных глав. Выберите другой сайт выше.',
    chap_short: 'Гл.',

    // Reader & Auto-Translate
    page_short: 'Стр.',
    mode_webtoon: 'Вебтун',
    mode_single: '1 стр.',
    mode_double: '2 стр.',
    bookmark_btn: 'Закладка',
    prev_ch: 'Пред. глава',
    next_ch: 'След. глава',
    loading_pages: 'Загрузка страниц...',
    tr_off: 'Перевод: Выкл',
    tr_ru: 'Перевод: Русский (RU)',
    tr_en: 'Перевод: English (EN)',
    tr_es: 'Перевод: Español (ES)',
    tr_de: 'Перевод: Deutsch (DE)',
    translating_page: 'OCR + перевод страницы...',

    // Library / Bookmarks / History / Stats / Profiles / Settings
    lib_empty: 'В избранном пока пусто. Откройте мангу и нажмите «В избранное».',
    bm_title: 'Закладки на страницах',
    bm_empty: 'Нет сохранённых закладок. Нажмите кнопку закладки во время чтения.',
    hist_title: 'История чтения',
    hist_clear: 'Очистить',
    hist_empty: 'История пуста',
    stats_title: 'Статистика чтения',
    stats_chapters: 'Глав прочитано',
    stats_pages: 'Страниц просмотрено',
    stats_time: 'Времени за чтением',
    stats_activity: 'Активность за 14 дней (страниц в день)',
    stats_top: 'Топ читаемых тайтлов',
    stats_no_data: 'Пока нет данных',
    prof_title: 'Профили',
    prof_desc: 'У каждого профиля своя библиотека, закладки, прочитанные главы и статистика.',
    prof_upload_avatar: 'Загрузить картинку',
    prof_change_avatar: 'Сменить аватар',
    prof_name_placeholder: 'Имя нового профиля...',
    prof_create: 'Создать',
    prof_active: 'Активен',
    prof_select: 'Выбрать',
    set_title: 'Настройки',
    set_ui_lang: 'Язык интерфейса и названий тайтлов',
    set_ui_lang_desc: 'Переключает язык меню и выбирает русские либо английские названия манги',
    set_content_lang: 'Язык перевода глав в каталоге',
    set_auto_translate: 'Автоперевод страниц манги (OCR + AI Translate)',
    set_auto_translate_desc: 'Автоматически распознаёт текст в облачках на странице и переводит на выбранный язык',
    set_scroll_sens: 'Чувствительность прокрутки колёсика мыши',
    set_scroll_sens_desc: 'Скорость вертикального скролла в ридере и каталоге (1.0x — стандартная)',
    set_adult: 'Возрастной рейтинг 18+ (жестокость, этти, сэйнэн)',
    set_hentai: 'Хентай (откровенный контент 18+)',
    set_mode: 'Режим чтения по умолчанию',
    set_upscale_title: 'Апскейлер и улучшение качества (Rust Engine)',
    set_upscale_desc: 'Нативная многопоточная обработка страниц на Rust и GPU-шейдеры в реальном времени.',
    set_FitWidth: 'Растягивать страницы по ширине',
    set_MaxWidth: 'Макс. ширина страницы в режиме Вебтун (px)',
    yes: 'Вкл',
    no: 'Выкл',

    // Upscaler modes
    up_off_label: 'Выкл (Оригинал)',
    up_off_desc: 'Оригинальное изображение без обработки',
    up_anime4k_label: 'Anime4K Fast (Шейдер)',
    up_anime4k_desc: 'Мгновенная реконструкция контуров и линий на видеокарте',
    up_lanczos_label: 'Rust Lanczos3 2x + Sharp',
    up_lanczos_desc: 'Двукратный нативный апскейл Lanczos3 + повышение резкости на Rust',
    up_hq_label: 'Rust Manga HQ (Денойз + 2x)',
    up_hq_desc: 'Удаление JPEG-шакалов + контраст контуров + 2x Lanczos3 на Rust',
    up_ink_label: 'Чистая тушь (B&W Контраст)',
    up_ink_desc: 'Выбеливание серого фона сканов и глубокий черный цвет туши и текста',
    up_vulkan_label: 'AI Real-ESRGAN / Waifu2x (Vulkan)',
    up_vulkan_desc: 'Нейросетевой апскейл через Vulkan GPU (при наличии модуля в папке upscaler/)',
  },
  en: {
    // Sidebar
    nav_browse: 'Browse',
    nav_library: 'Library',
    nav_bookmarks: 'Bookmarks',
    nav_history: 'History',
    nav_stats: 'Statistics',
    nav_profiles: 'Profiles',
    nav_settings: 'Settings',
    widget_today: 'Today',
    widget_total: 'Total',
    widget_time: 'Time',
    widget_pages: 'Pages',
    widget_chapters: 'Chapters',
    time_h: 'h',
    time_m: 'm',

    // Browse
    search_placeholder: 'Search manga, manhwa, manhua...',
    tab_search_placeholder: 'Filter by title...',
    ch_search_placeholder: 'Search chapter (e.g. 45)...',
    search_btn: 'Search',
    search_suggestions: 'Quick jump to title',
    search_show_all: 'Show all search results',
    sort_popular: 'Popular',
    sort_rating: 'Top Rated',
    sort_new: 'Newest',
    sort_chapters: 'Most Chapters',
    kind_all: 'All Formats',
    kind_manga: 'Manga (JP)',
    kind_manhwa: 'Manhwa (KR)',
    kind_manhua: 'Manhua (CN)',
    adult_hide: 'Hide 18+',
    adult_allow: 'Allow 18+',
    adult_only: 'Only 18+',
    hentai_hide: 'Hide Hentai',
    hentai_allow: 'Allow Hentai',
    hentai_only: 'Only Hentai',
    lang_all: 'All Languages',
    lang_ru: 'Russian',
    lang_en: 'English',
    btn_genres: 'Genres',
    btn_sources: 'Sources',
    btn_reset: 'Reset',
    select_all: 'Select all',
    clear_selection: 'Clear',
    heading_search: 'Search Results',
    loading: 'Loading...',
    load_more: 'Load More',
    nothing_found: 'No titles found matching selected filters',

    // Detail
    back: 'Back',
    source_select_label: 'Manga Source:',
    searching_sources: 'checking other sites...',
    in_library: 'In Library',
    add_to_library: 'Add to Library',
    continue_reading: 'Continue',
    start_reading: 'Read from Start',
    download_all: 'Download All',
    downloading: 'Downloading...',
    open_downloads: 'Downloads Folder',
    btn_translate_desc: 'Translate Description',
    btn_show_orig_desc: 'Show Original',
    chapters_title: 'Chapters',
    chapters_found_count: 'chapters',
    read_progress: 'Read',
    mark_all_read: 'Mark All Read',
    mark_all_unread: 'Reset Read Marks',
    mark_read_title: 'Toggle chapter read status',
    mark_up_to_here: 'Mark previous chapters as read',
    download_chapter: 'Download chapter',
    downloaded_badge: 'Downloaded',
    read_badge: 'Read',
    no_chapters_in_source: 'No chapters found on this source. Switch to another site above.',
    chap_short: 'Ch.',

    // Reader & Auto-Translate
    page_short: 'Page',
    mode_webtoon: 'Webtoon',
    mode_single: '1 Page',
    mode_double: '2 Pages',
    bookmark_btn: 'Bookmark',
    prev_ch: 'Prev Ch.',
    next_ch: 'Next Ch.',
    loading_pages: 'Loading pages...',
    tr_off: 'Translate: Off',
    tr_ru: 'Translate: Russian (RU)',
    tr_en: 'Translate: English (EN)',
    tr_es: 'Translate: Español (ES)',
    tr_de: 'Translate: Deutsch (DE)',
    translating_page: 'OCR + translating page...',

    // Library / Bookmarks / History / Stats / Profiles / Settings
    lib_empty: 'Your library is empty. Open any title and click "Add to Library".',
    bm_title: 'Page Bookmarks',
    bm_empty: 'No saved bookmarks yet. Click the bookmark button while reading.',
    hist_title: 'Reading History',
    hist_clear: 'Clear',
    hist_empty: 'History is empty',
    stats_title: 'Reading Statistics',
    stats_chapters: 'Chapters Read',
    stats_pages: 'Pages Viewed',
    stats_time: 'Reading Time',
    stats_activity: 'Last 14 Days Activity (pages per day)',
    stats_top: 'Most Read Titles',
    stats_no_data: 'No data yet',
    prof_title: 'Profiles',
    prof_desc: 'Each profile keeps its own library, bookmarks, read chapters, and statistics.',
    prof_upload_avatar: 'Upload Image',
    prof_change_avatar: 'Change Avatar',
    prof_name_placeholder: 'New profile name...',
    prof_create: 'Create',
    prof_active: 'Active',
    prof_select: 'Select',
    set_title: 'Settings',
    set_ui_lang: 'Interface & Title Language',
    set_ui_lang_desc: 'Switches the interface language and prefers Russian or English manga titles',
    set_content_lang: 'Chapter Translation Language',
    set_auto_translate: 'Auto-Translate Manga Pages (OCR + AI Translate)',
    set_auto_translate_desc: 'Detects speech bubble text on pages and translates it into the selected language',
    set_scroll_sens: 'Mouse Wheel Scroll Sensitivity',
    set_scroll_sens_desc: 'Vertical scroll speed multiplier in the reader and catalog (1.0x is default)',
    set_adult: '18+ Mature Rating (violence, ecchi, seinen 18+)',
    set_hentai: 'Hentai (explicit 18+ content)',
    set_mode: 'Default Reading Mode',
    set_upscale_title: 'Image Upscaler & Enhancement (Rust Engine)',
    set_upscale_desc: 'Native multi-threaded Rust image processing and real-time GPU shaders.',
    set_FitWidth: 'Fit pages to width',
    set_MaxWidth: 'Max page width in Webtoon mode (px)',
    yes: 'On',
    no: 'Off',

    // Upscaler modes
    up_off_label: 'Off (Original)',
    up_off_desc: 'Original image without processing',
    up_anime4k_label: 'Anime4K Fast (Shader)',
    up_anime4k_desc: 'Instant line & contour reconstruction shader on GPU',
    up_lanczos_label: 'Rust Lanczos3 2x + Sharp',
    up_lanczos_desc: '2x native Lanczos3 upscale + contour sharpening in Rust',
    up_hq_label: 'Rust Manga HQ (Denoise + 2x)',
    up_hq_desc: 'JPEG artifact removal + edge contrast + 2x Lanczos3 in Rust',
    up_ink_label: 'Pure Ink (B&W Contrast)',
    up_ink_desc: 'Whitens gray scan paper and deepens black ink and text',
    up_vulkan_label: 'AI Real-ESRGAN / Waifu2x (Vulkan)',
    up_vulkan_desc: 'Neural GPU upscale via Vulkan (when binary is placed in upscaler/)',
  },
} as const;

export type I18nKey = keyof typeof DICT.ru;

export function tr(lang: UILang, key: I18nKey): string {
  return DICT[lang]?.[key] ?? DICT.ru[key] ?? key;
}

const hasCyrillic = (s: string) => /[а-яёА-ЯЁ]/.test(s);
const hasCJK = (s: string) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(s);
const hasLatin = (s: string) => /[a-zA-Z]{2,}/.test(s);

export function getDisplayTitle(m: Manga, uiLang: UILang): string {
  const candidates: string[] = [];
  if (m.title) candidates.push(m.title);
  if (Array.isArray(m.altTitles)) {
    for (const a of m.altTitles) if (a && typeof a === 'string') candidates.push(a);
  }
  if (Array.isArray(m.variants)) {
    for (const v of m.variants) {
      if (v.title) candidates.push(v.title);
      if (Array.isArray(v.altTitles)) {
        for (const a of v.altTitles) if (a && typeof a === 'string') candidates.push(a);
      }
    }
  }

  if (uiLang === 'ru') {
    const cyr = candidates.find((c) => hasCyrillic(c));
    if (cyr) return cyr;
  } else {
    const eng = candidates.find((c) => hasLatin(c) && !hasCyrillic(c) && !hasCJK(c));
    if (eng) return eng;
  }
  return m.title || candidates[0] || '';
}

export function getSubtitle(m: Manga, uiLang: UILang): string | undefined {
  const main = getDisplayTitle(m, uiLang);
  const otherLang: UILang = uiLang === 'ru' ? 'en' : 'ru';
  const sub = getDisplayTitle(m, otherLang);
  if (sub && sub.toLowerCase() !== main.toLowerCase()) return sub;
  const alt = m.altTitles?.find((a) => a && a.toLowerCase() !== main.toLowerCase());
  return alt;
}
