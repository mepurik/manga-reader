#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use http::{header, Response, StatusCode};
use image::{
    codecs::jpeg::JpegEncoder,
    imageops::{self, FilterType},
    DynamicImage, ImageBuffer, Rgb, RgbImage,
};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    borrow::Cow,
    collections::HashMap,
    env,
    fs::{self, File},
    io::{Read, Write},
    net::{SocketAddr, ToSocketAddrs},
    os::windows::process::CommandExt,
    path::PathBuf,
    process::Command,
    sync::OnceLock,
    time::Duration,
};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::{Icon, Theme, WindowBuilder},
};
use url::Url;
use windows::{
    core::HSTRING,
    Globalization::Language,
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::{FileAccessMode, StorageFile},
};
use wry::{RequestAsyncResponder, WebViewBuilder};
use zip::{write::FileOptions, CompressionMethod, ZipWriter};

const CREATE_NO_WINDOW: u32 = 0x08000000;
const CHROME_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MANGADEX_UA: &str = "MangaReader/1.0 (https://mangadex.org)";

#[derive(Deserialize, Default)]
struct ProxyOpts {
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
}

#[derive(Deserialize)]
struct ProxyPayload {
    url: String,
    opts: Option<ProxyOpts>,
}

#[derive(Deserialize)]
struct DownloadPageItem {
    url: String,
    referer: Option<String>,
}

#[derive(Deserialize)]
struct DownloadChapterPayload {
    manga_title: String,
    chapter_title: String,
    pages: Vec<DownloadPageItem>,
    upscale: Option<String>,
}

#[derive(Serialize)]
struct DownloadChapterResponse {
    ok: bool,
    dir: String,
    cbz: String,
    count: usize,
    error: Option<String>,
}

#[derive(Deserialize)]
struct OpenFolderPayload {
    path: String,
}

#[derive(Deserialize)]
struct TranslateTextPayload {
    text: String,
    target_lang: String,
}

#[derive(Serialize)]
struct TranslateTextResponse {
    ok: bool,
    translated: String,
}

#[derive(Deserialize)]
struct TranslatePagePayload {
    url: String,
    referer: Option<String>,
    target_lang: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct TranslatedBubble {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    original: String,
    translated: String,
}

#[derive(Serialize)]
struct TranslatePageResponse {
    ok: bool,
    bubbles: Vec<TranslatedBubble>,
    error: Option<String>,
}

fn render_window_icon(_size: u32) -> Option<Icon> {
    let png_bytes = include_bytes!("../icons/11_Cutout_Ribbon_M_Violet.png");
    let img = image::load_from_memory(png_bytes).ok()?.into_rgba8();
    let (w, h) = img.dimensions();
    Icon::from_rgba(img.into_raw(), w, h).ok()
}

fn ipv4_resolver(netloc: &str) -> std::io::Result<Vec<SocketAddr>> {
    let addrs: Vec<SocketAddr> = netloc.to_socket_addrs()?.collect();
    let mut v4: Vec<SocketAddr> = addrs.iter().copied().filter(|a| a.is_ipv4()).collect();
    let v6: Vec<SocketAddr> = addrs.into_iter().filter(|a| a.is_ipv6()).collect();
    v4.extend(v6);
    Ok(v4)
}

fn http_agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(10))
            .timeout_read(Duration::from_secs(25))
            .timeout_write(Duration::from_secs(15))
            .resolver(ipv4_resolver)
            .build()
    })
}

fn detect_physical_lan_ip() -> Option<String> {
    static LAN_IP: OnceLock<Option<String>> = OnceLock::new();
    LAN_IP
        .get_or_init(|| {
            let out = Command::new("ipconfig")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .ok()?;
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if let Some(pos) = line.find("192.168.") {
                    let ip: String = line[pos..]
                        .chars()
                        .take_while(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                    if !ip.starts_with("192.168.56.") && ip.split('.').count() == 4 {
                        return Some(ip);
                    }
                }
            }
            None
        })
        .clone()
}

fn curl_fetch(
    target_url: &str,
    method: &str,
    headers: &[(String, String)],
    body: Option<&str>,
    use_lan_interface: bool,
) -> Option<(u16, Vec<u8>)> {
    let mut cmd = Command::new("curl.exe");
    cmd.creation_flags(CREATE_NO_WINDOW);
    // Note `-g` (--globoff) so URLs with `[]` brackets (e.g. site_id[]=1, order[relevance]=desc) work!
    cmd.args(["-g", "-s", "-S", "-L", "--compressed", "--max-time", "20", "-X", method]);

    if use_lan_interface {
        if let Some(ip) = detect_physical_lan_ip() {
            cmd.args(["--interface", &ip]);
        }
    }

    for (k, v) in headers {
        cmd.args(["-H", &format!("{k}: {v}")]);
    }
    if let Some(b) = body {
        cmd.args(["--data-raw", b]);
    }

    cmd.args(["-w", "\n__HTTP_STATUS__:%{http_code}", target_url]);
    let out = cmd.output().ok()?;
    let raw = out.stdout;
    let marker = b"\n__HTTP_STATUS__:";
    if let Some(pos) = raw.windows(marker.len()).rposition(|w| w == marker) {
        let status_str = String::from_utf8_lossy(&raw[pos + marker.len()..]);
        let code: u16 = status_str.trim().parse().unwrap_or(502);
        let body_bytes = raw[..pos].to_vec();
        if code > 0 {
            return Some((code, body_bytes));
        }
    }
    None
}

fn cache_dir() -> &'static PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let base = env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(env::temp_dir);
        let dir = base.join("manga-reader-rust").join("img-cache");
        let _ = fs::create_dir_all(&dir);
        dir
    })
}

fn downloads_dir() -> PathBuf {
    let base = env::var_os("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Downloads"))
        .unwrap_or_else(env::temp_dir);
    let dir = base.join("MangaReader");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "Manga".to_string()
    } else {
        trimmed.chars().take(90).collect()
    }
}

fn dist_dir() -> PathBuf {
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p1 = parent.join("dist");
            if p1.join("index.html").exists() {
                return p1;
            }
            if let Some(root) = parent.parent().and_then(|p| p.parent()) {
                let p2 = root.join("dist");
                if p2.join("index.html").exists() {
                    return p2;
                }
            }
        }
    }
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join("dist");
    if cwd.join("index.html").exists() {
        return cwd;
    }
    PathBuf::from(r"C:\Users\spruitys\manga-reader-rust\dist")
}

fn hash_key(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    format!("{:x}", h.finalize())
}

fn guess_mime(path_or_url: &str, bytes: &[u8]) -> &'static str {
    if bytes.len() >= 12 {
        if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            return "image/jpeg";
        }
        if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
            return "image/png";
        }
        if &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            return "image/webp";
        }
        if bytes.starts_with(b"GIF8") {
            return "image/gif";
        }
    }
    let lower = path_or_url.to_ascii_lowercase();
    if lower.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if lower.ends_with(".js") || lower.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if lower.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else {
        "image/jpeg"
    }
}

fn fetch_bytes(target_url: &str, referer: Option<&str>) -> Result<Vec<u8>, String> {
    let is_md = target_url.contains("mangadex.org") || target_url.contains("mangadex.network");
    let ua = if is_md { MANGADEX_UA } else { CHROME_UA };
    let mut req = http_agent()
        .get(target_url)
        .set("User-Agent", ua)
        .set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
        .set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");

    let mut hdrs = vec![
        ("User-Agent".to_string(), ua.to_string()),
        (
            "Accept".to_string(),
            "image/avif,image/webp,image/apng,image/*,*/*;q=0.8".to_string(),
        ),
    ];

    if !is_md {
        if let Some(r) = referer.filter(|s| !s.is_empty()) {
            req = req.set("Referer", r);
            hdrs.push(("Referer".to_string(), r.to_string()));
        }
    }

    match req.call() {
        Ok(resp) => {
            let mut buf = Vec::with_capacity(256 * 1024);
            resp.into_reader()
                .take(35 * 1024 * 1024)
                .read_to_end(&mut buf)
                .map_err(|e| e.to_string())?;
            Ok(buf)
        }
        Err(_) => {
            let is_ru = target_url.contains("remanga") || target_url.contains("re-manga");
            if let Some((code, b)) = curl_fetch(target_url, "GET", &hdrs, None, is_ru) {
                if (200..300).contains(&code) && !b.is_empty() {
                    return Ok(b);
                }
            }
            if is_ru {
                if let Some((code, b)) = curl_fetch(target_url, "GET", &hdrs, None, false) {
                    if (200..300).contains(&code) && !b.is_empty() {
                        return Ok(b);
                    }
                }
            }
            Err("Image fetch failed".to_string())
        }
    }
}

// ============================================================================
// NATIVE WINDOWS OCR + GOOGLE TRANSLATE ENGINE FOR MANGA
// ============================================================================

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn google_translate_text(text: &str, target_lang: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let tl = if target_lang.is_empty() { "ru" } else { target_lang };
    let api_url = format!(
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={}&dt=t&q={}",
        url_encode(tl),
        url_encode(text)
    );

    let resp_str = match http_agent().get(&api_url).set("User-Agent", CHROME_UA).call() {
        Ok(resp) => resp.into_string().map_err(|e| e.to_string())?,
        Err(_) => {
            let hdrs = vec![("User-Agent".to_string(), CHROME_UA.to_string())];
            let (_, bytes) = curl_fetch(&api_url, "GET", &hdrs, None, false)
                .ok_or_else(|| "Translation network error".to_string())?;
            String::from_utf8_lossy(&bytes).to_string()
        }
    };

    let val: serde_json::Value = serde_json::from_str(&resp_str).map_err(|e| e.to_string())?;
    let mut result = String::new();
    if let Some(arr) = val.get(0).and_then(|v| v.as_array()) {
        for seg in arr {
            if let Some(chunk) = seg.get(0).and_then(|v| v.as_str()) {
                result.push_str(chunk);
            }
        }
    }
    if result.is_empty() {
        Ok(text.to_string())
    } else {
        Ok(result)
    }
}

#[derive(Clone)]
struct RawOcrLine {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    text: String,
}

fn ocr_and_translate_page(target_url: &str, referer: Option<&str>, target_lang: &str) -> Result<Vec<TranslatedBubble>, String> {
    let raw_hash = hash_key(target_url);
    let tr_cache_path = cache_dir().join(format!("{raw_hash}_tr_{target_lang}.json"));

    if let Ok(cached_json) = fs::read_to_string(&tr_cache_path) {
        if let Ok(bubbles) = serde_json::from_str::<Vec<TranslatedBubble>>(&cached_json) {
            return Ok(bubbles);
        }
    }

    let raw_bytes = get_or_fetch_page_bytes(target_url, referer, "off")?;
    let decoded = image::load_from_memory(&raw_bytes).map_err(|e| e.to_string())?;
    let rgb = decoded.to_rgb8();
    let img_w = rgb.width().max(1) as f32;
    let img_h = rgb.height().max(1) as f32;

    // Save temporary JPEG for WinRT BitmapDecoder
    let tmp_jpg = cache_dir().join(format!("{raw_hash}_ocr_tmp.jpg"));
    if !tmp_jpg.exists() {
        let jpg_bytes = encode_jpeg(&rgb, 90)?;
        fs::write(&tmp_jpg, jpg_bytes).map_err(|e| e.to_string())?;
    }

    // Choose OCR recognizer language:
    // If translating INTO Russian (or Spanish/German/etc.), source manga is usually English -> use en-US OCR;
    // If translating INTO English, try en-US first or ru if Russian text is present.
    let ocr_lang_tag = if target_lang == "en" { "ru" } else { "en-US" };

    let run_winrt_ocr = |lang_tag: &str| -> Result<Vec<RawOcrLine>, String> {
        let path_hstr = HSTRING::from(tmp_jpg.as_os_str());
        let file = StorageFile::GetFileFromPathAsync(&path_hstr)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let stream = file
            .OpenAsync(FileAccessMode::Read)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let decoder = BitmapDecoder::CreateAsync(&stream)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;
        let bitmap = decoder
            .GetSoftwareBitmapAsync()
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let lang = Language::CreateLanguage(&HSTRING::from(lang_tag)).map_err(|e| e.to_string())?;
        let engine = OcrEngine::TryCreateFromLanguage(&lang)
            .or_else(|_| OcrEngine::TryCreateFromUserProfileLanguages())
            .map_err(|e| e.to_string())?;

        let ocr_res = engine
            .RecognizeAsync(&bitmap)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        let lines = ocr_res.Lines().map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for line in lines {
            let text = line.Text().map_err(|e| e.to_string())?.to_string();
            let clean = text.trim().to_string();
            if clean.len() < 2 {
                continue;
            }
            let words = line.Words().map_err(|e| e.to_string())?;
            let mut min_x = f32::MAX;
            let mut min_y = f32::MAX;
            let mut max_x = 0.0f32;
            let mut max_y = 0.0f32;
            for w in words {
                if let Ok(r) = w.BoundingRect() {
                    min_x = min_x.min(r.X);
                    min_y = min_y.min(r.Y);
                    max_x = max_x.max(r.X + r.Width);
                    max_y = max_y.max(r.Y + r.Height);
                }
            }
            if max_x > min_x && max_y > min_y {
                out.push(RawOcrLine {
                    x1: min_x,
                    y1: min_y,
                    x2: max_x,
                    y2: max_y,
                    text: clean,
                });
            }
        }
        Ok(out)
    };

    let mut raw_lines = run_winrt_ocr(ocr_lang_tag).unwrap_or_default();
    if raw_lines.is_empty() && ocr_lang_tag != "en-US" {
        raw_lines = run_winrt_ocr("en-US").unwrap_or_default();
    }
    let _ = fs::remove_file(&tmp_jpg);

    if raw_lines.is_empty() {
        return Ok(Vec::new());
    }

    // Sort lines top-to-bottom
    raw_lines.sort_by(|a, b| a.y1.partial_cmp(&b.y1).unwrap_or(std::cmp::Ordering::Equal));

    // Group nearby lines into unified speech bubbles
    let mut groups: Vec<RawOcrLine> = Vec::new();
    for line in raw_lines {
        let line_h = (line.y2 - line.y1).max(8.0);
        let line_cx = (line.x1 + line.x2) * 0.5;
        let mut merged = false;

        for g in groups.iter_mut().rev() {
            let g_cx = (g.x1 + g.x2) * 0.5;
            let g_w = (g.x2 - g.x1).max(20.0);
            let line_w = (line.x2 - line.x1).max(20.0);
            let max_w = g_w.max(line_w);
            let v_gap = line.y1 - g.y2;

            // If vertically adjacent within 1.8x line height and horizontally aligned within speech bubble width
            if v_gap >= -line_h * 0.6 && v_gap <= line_h * 1.85 && (line_cx - g_cx).abs() <= max_w * 0.72 {
                g.x1 = g.x1.min(line.x1);
                g.y1 = g.y1.min(line.y1);
                g.x2 = g.x2.max(line.x2);
                g.y2 = g.y2.max(line.y2);
                g.text.push(' ');
                g.text.push_str(&line.text);
                merged = true;
                break;
            }
        }
        if !merged {
            groups.push(line);
        }
    }

    // Filter out tiny noise (single numbers/symbols)
    groups.retain(|g| g.text.chars().any(|c| c.is_alphabetic()) && g.text.len() >= 2);
    if groups.is_empty() {
        return Ok(Vec::new());
    }

    // Batch translate all bubbles in a single request using newline separator
    let combined = groups
        .iter()
        .map(|g| g.text.replace('\n', " "))
        .collect::<Vec<_>>()
        .join("\n");

    let translated_all = google_translate_text(&combined, target_lang)?;
    let trans_lines: Vec<&str> = translated_all.split('\n').collect();

    let mut bubbles = Vec::with_capacity(groups.len());
    for (i, g) in groups.into_iter().enumerate() {
        let tr_text = trans_lines
            .get(i)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| google_translate_text(&g.text, target_lang).unwrap_or_else(|_| g.text.clone()));

        // Convert to percentage (0..100) with slight padding so bubble covers original text cleanly
        let pad_x = 0.8;
        let pad_y = 0.4;
        let x = ((g.x1 / img_w) * 100.0 - pad_x).clamp(0.0, 98.0);
        let y = ((g.y1 / img_h) * 100.0 - pad_y).clamp(0.0, 98.0);
        let w = (((g.x2 - g.x1) / img_w) * 100.0 + pad_x * 2.0).clamp(4.0, 100.0 - x);
        let h = (((g.y2 - g.y1) / img_h) * 100.0 + pad_y * 2.0).clamp(1.8, 100.0 - y);

        bubbles.push(TranslatedBubble {
            x,
            y,
            w,
            h,
            original: g.text,
            translated: tr_text,
        });
    }

    if let Ok(json_str) = serde_json::to_string(&bubbles) {
        let _ = fs::write(&tr_cache_path, json_str);
    }

    Ok(bubbles)
}

// ============================================================================
// NATIVE RUST MANGA UPSCALER ENGINE
// ============================================================================

fn bilateral_denoise_rgb(img: &RgbImage, threshold: i32) -> RgbImage {
    let w = img.width() as usize;
    let h = img.height() as usize;
    if w < 4 || h < 4 {
        return img.clone();
    }
    let src = img.as_raw();
    let mut dst = vec![0u8; src.len()];

    dst.par_chunks_mut(w * 3).enumerate().for_each(|(y, row_out)| {
        if y == 0 || y + 1 >= h {
            let start = y * w * 3;
            row_out.copy_from_slice(&src[start..start + w * 3]);
            return;
        }
        for x in 0..w {
            let idx = (y * w + x) * 3;
            if x == 0 || x + 1 >= w {
                row_out[x * 3] = src[idx];
                row_out[x * 3 + 1] = src[idx + 1];
                row_out[x * 3 + 2] = src[idx + 2];
                continue;
            }
            let r0 = src[idx] as i32;
            let g0 = src[idx + 1] as i32;
            let b0 = src[idx + 2] as i32;

            let mut sr = r0 * 4;
            let mut sg = g0 * 4;
            let mut sb = b0 * 4;
            let mut wsum = 4;

            for dy in [-1isize, 0, 1] {
                for dx in [-1isize, 0, 1] {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let ny = (y as isize + dy) as usize;
                    let nx = (x as isize + dx) as usize;
                    let nidx = (ny * w + nx) * 3;
                    let nr = src[nidx] as i32;
                    let ng = src[nidx + 1] as i32;
                    let nb = src[nidx + 2] as i32;

                    let diff = (nr - r0).abs().max((ng - g0).abs()).max((nb - b0).abs());
                    if diff <= threshold {
                        let weight = if dx == 0 || dy == 0 { 2 } else { 1 };
                        sr += nr * weight;
                        sg += ng * weight;
                        sb += nb * weight;
                        wsum += weight;
                    }
                }
            }

            row_out[x * 3] = (sr / wsum).clamp(0, 255) as u8;
            row_out[x * 3 + 1] = (sg / wsum).clamp(0, 255) as u8;
            row_out[x * 3 + 2] = (sb / wsum).clamp(0, 255) as u8;
        }
    });

    ImageBuffer::from_raw(w as u32, h as u32, dst).unwrap_or_else(|| img.clone())
}

fn ink_contrast_rgb(img: &RgbImage) -> RgbImage {
    let w = img.width() as usize;
    let h = img.height() as usize;
    let src = img.as_raw();
    let mut dst = vec![0u8; src.len()];

    dst.par_chunks_mut(w * 3).enumerate().for_each(|(y, row_out)| {
        let row_in = &src[y * w * 3..(y + 1) * w * 3];
        for x in 0..w {
            let r = row_in[x * 3] as i32;
            let g = row_in[x * 3 + 1] as i32;
            let b = row_in[x * 3 + 2] as i32;

            let max_c = r.max(g).max(b);
            let min_c = r.min(g).min(b);
            let sat = max_c - min_c;

            if sat <= 24 {
                let lum = (r * 77 + g * 150 + b * 29) >> 8;
                let norm = ((lum - 42) * 255 / (220 - 42)).clamp(0, 255) as u8;
                row_out[x * 3] = norm;
                row_out[x * 3 + 1] = norm;
                row_out[x * 3 + 2] = norm;
            } else {
                let boost = |c: i32| ((c - 128) * 112 / 100 + 128).clamp(0, 255) as u8;
                row_out[x * 3] = boost(r);
                row_out[x * 3 + 1] = boost(g);
                row_out[x * 3 + 2] = boost(b);
            }
        }
    });

    ImageBuffer::<Rgb<u8>, Vec<u8>>::from_raw(w as u32, h as u32, dst).unwrap_or_else(|| img.clone())
}

fn target_dimensions(w: u32, h: u32, scale: f32, max_w: u32) -> (u32, u32) {
    if w >= max_w {
        return (w, h);
    }
    let nw = ((w as f32 * scale).round() as u32).min(max_w);
    let ratio = nw as f32 / w.max(1) as f32;
    let nh = (h as f32 * ratio).round() as u32;
    (nw.max(1), nh.max(1))
}

fn encode_jpeg(rgb: &RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity((rgb.width() * rgb.height()) as usize);
    let mut enc = JpegEncoder::new_with_quality(&mut out, quality);
    enc.encode_image(rgb).map_err(|e| e.to_string())?;
    Ok(out)
}

fn find_vulkan_upscaler() -> Option<(PathBuf, bool)> {
    let candidates = [
        ("upscaler/realesrgan-ncnn-vulkan.exe", true),
        ("upscaler/waifu2x-ncnn-vulkan.exe", false),
    ];
    for (rel, is_esrgan) in candidates {
        let p1 = PathBuf::from(rel);
        if p1.exists() {
            return Some((p1, is_esrgan));
        }
        if let Ok(exe) = env::current_exe() {
            if let Some(dir) = exe.parent() {
                let p2 = dir.join(rel);
                if p2.exists() {
                    return Some((p2, is_esrgan));
                }
            }
        }
    }
    None
}

fn upscale_image_rust(raw_bytes: &[u8], mode: &str, cache_key: &str) -> Result<Vec<u8>, String> {
    if mode == "ai_vulkan" {
        if let Some((bin_path, is_esrgan)) = find_vulkan_upscaler() {
            let in_file = cache_dir().join(format!("{cache_key}_in.jpg"));
            let out_file = cache_dir().join(format!("{cache_key}_vulkan.png"));
            if fs::write(&in_file, raw_bytes).is_ok() {
                let mut cmd = Command::new(&bin_path);
                cmd.creation_flags(CREATE_NO_WINDOW);
                if is_esrgan {
                    cmd.args([
                        "-i",
                        in_file.to_str().unwrap_or(""),
                        "-o",
                        out_file.to_str().unwrap_or(""),
                        "-n",
                        "realesrgan-x4plus-anime",
                        "-s",
                        "2",
                    ]);
                } else {
                    cmd.args([
                        "-i",
                        in_file.to_str().unwrap_or(""),
                        "-o",
                        out_file.to_str().unwrap_or(""),
                        "-n",
                        "2",
                        "-s",
                        "2",
                    ]);
                }
                if let Ok(status) = cmd.status() {
                    let _ = fs::remove_file(&in_file);
                    if status.success() {
                        if let Ok(bytes) = fs::read(&out_file) {
                            let _ = fs::remove_file(&out_file);
                            return Ok(bytes);
                        }
                    }
                }
            }
        }
    }

    let decoded = image::load_from_memory(raw_bytes).map_err(|e| e.to_string())?;
    let rgb = decoded.to_rgb8();
    let (w, h) = (rgb.width(), rgb.height());
    let max_w = if h > 4000 { 1650 } else { 2100 };

    let processed: RgbImage = match mode {
        "rust_lanczos" => {
            let (nw, nh) = target_dimensions(w, h, 1.85, max_w);
            let resized = if (nw, nh) != (w, h) {
                imageops::resize(&rgb, nw, nh, FilterType::Lanczos3)
            } else {
                rgb
            };
            imageops::unsharpen(&resized, 1.15, 4)
        }
        "rust_ink" => {
            let denoised = bilateral_denoise_rgb(&rgb, 14);
            let inked = ink_contrast_rgb(&denoised);
            let (nw, nh) = target_dimensions(w, h, 1.75, max_w);
            let resized = if (nw, nh) != (w, h) {
                imageops::resize(&inked, nw, nh, FilterType::Lanczos3)
            } else {
                inked
            };
            imageops::unsharpen(&resized, 1.45, 5)
        }
        _ => {
            let denoised = bilateral_denoise_rgb(&rgb, 15);
            let (nw, nh) = target_dimensions(w, h, 1.85, max_w);
            let resized = if (nw, nh) != (w, h) {
                imageops::resize(&denoised, nw, nh, FilterType::Lanczos3)
            } else {
                denoised
            };
            let contrasted = DynamicImage::ImageRgb8(resized).adjust_contrast(7.5).to_rgb8();
            imageops::unsharpen(&contrasted, 1.35, 3)
        }
    };

    encode_jpeg(&processed, 92)
}

fn get_or_fetch_page_bytes(target_url: &str, referer: Option<&str>, up_mode: &str) -> Result<Vec<u8>, String> {
    let raw_hash = hash_key(target_url);
    let raw_cache_path = cache_dir().join(format!("{raw_hash}.raw"));
    let needs_rust_upscale = matches!(
        up_mode,
        "rust_lanczos" | "rust_manga_hq" | "rust_ink" | "ai_vulkan"
    );
    let up_cache_path = if needs_rust_upscale {
        Some(cache_dir().join(format!("{raw_hash}_{up_mode}.jpg")))
    } else {
        None
    };

    if let Some(ref up_path) = up_cache_path {
        if let Ok(cached_up) = fs::read(up_path) {
            if !cached_up.is_empty() {
                return Ok(cached_up);
            }
        }
    }

    let raw_bytes = match fs::read(&raw_cache_path) {
        Ok(b) if !b.is_empty() => b,
        _ => {
            let b = fetch_bytes(target_url, referer)?;
            let _ = fs::write(&raw_cache_path, &b);
            b
        }
    };

    if needs_rust_upscale {
        if let Ok(up_bytes) = upscale_image_rust(&raw_bytes, up_mode, &raw_hash) {
            if let Some(ref up_path) = up_cache_path {
                let _ = fs::write(up_path, &up_bytes);
            }
            return Ok(up_bytes);
        }
    }

    Ok(raw_bytes)
}

// ============================================================================
// PROTOCOL HANDLERS (app://, mhttp://, mimg://)
// ============================================================================

fn handle_app_request(req: http::Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let uri_path = req.uri().path().trim_start_matches('/');
    let rel = if uri_path.is_empty() { "index.html" } else { uri_path };
    let base = dist_dir();
    let file_path = base.join(rel);

    let final_path = if file_path.is_file() {
        file_path
    } else {
        base.join("index.html")
    };

    match fs::read(&final_path) {
        Ok(bytes) => {
            let mime = guess_mime(&final_path.to_string_lossy(), &bytes);
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                .body(Cow::Owned(bytes))
                .unwrap()
        }
        Err(e) => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(Cow::Owned(format!("File not found: {e}").into_bytes()))
            .unwrap(),
    }
}

fn json_ok_response<T: Serialize>(val: &T) -> Response<Cow<'static, [u8]>> {
    let bytes = serde_json::to_vec(val).unwrap_or_default();
    Response::builder()
        .status(StatusCode::OK)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "x-upstream-status")
        .header("x-upstream-status", "200")
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .body(Cow::Owned(bytes))
        .unwrap()
}

fn handle_mhttp_async(req: http::Request<Vec<u8>>, responder: RequestAsyncResponder) {
    if req.method() == http::Method::OPTIONS {
        let resp = Response::builder()
            .status(StatusCode::NO_CONTENT)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, POST, OPTIONS")
            .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "*")
            .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "x-upstream-status")
            .body(Cow::Borrowed(&b""[..]))
            .unwrap();
        responder.respond(resp);
        return;
    }

    let path = req.uri().path().to_string();
    let body_bytes = req.into_body();

    rayon::spawn(move || {
        if path.ends_with("/translate-text") {
            if let Ok(payload) = serde_json::from_slice::<TranslateTextPayload>(&body_bytes) {
                match google_translate_text(&payload.text, &payload.target_lang) {
                    Ok(translated) => {
                        responder.respond(json_ok_response(&TranslateTextResponse { ok: true, translated }));
                    }
                    Err(_) => {
                        responder.respond(json_ok_response(&TranslateTextResponse {
                            ok: false,
                            translated: payload.text,
                        }));
                    }
                }
                return;
            }
        }

        if path.ends_with("/translate-page") {
            if let Ok(payload) = serde_json::from_slice::<TranslatePagePayload>(&body_bytes) {
                match ocr_and_translate_page(&payload.url, payload.referer.as_deref(), &payload.target_lang) {
                    Ok(bubbles) => {
                        responder.respond(json_ok_response(&TranslatePageResponse {
                            ok: true,
                            bubbles,
                            error: None,
                        }));
                    }
                    Err(e) => {
                        responder.respond(json_ok_response(&TranslatePageResponse {
                            ok: false,
                            bubbles: Vec::new(),
                            error: Some(e),
                        }));
                    }
                }
                return;
            }
        }

        if path.ends_with("/download-chapter") {
            let parsed: Result<DownloadChapterPayload, _> = serde_json::from_slice(&body_bytes);
            let Ok(payload) = parsed else {
                responder.respond(json_ok_response(&DownloadChapterResponse {
                    ok: false,
                    dir: String::new(),
                    cbz: String::new(),
                    count: 0,
                    error: Some("Invalid JSON payload".to_string()),
                }));
                return;
            };

            let manga_dir = downloads_dir().join(sanitize_filename(&payload.manga_title));
            let chap_name = sanitize_filename(&payload.chapter_title);
            let chap_dir = manga_dir.join(&chap_name);
            let _ = fs::create_dir_all(&chap_dir);

            let up_mode = payload.upscale.unwrap_or_else(|| "off".to_string());
            let fetched: Vec<(usize, Vec<u8>)> = payload
                .pages
                .par_iter()
                .enumerate()
                .filter_map(|(i, p)| {
                    get_or_fetch_page_bytes(&p.url, p.referer.as_deref(), &up_mode)
                        .ok()
                        .map(|b| (i + 1, b))
                })
                .collect();

            let cbz_path = manga_dir.join(format!("{chap_name}.cbz"));
            let mut zip_writer = File::create(&cbz_path).ok().map(ZipWriter::new);
            let zip_opts = FileOptions::default().compression_method(CompressionMethod::Stored);

            let mut saved_count = 0usize;
            for (idx, bytes) in fetched {
                let ext = match guess_mime("", &bytes) {
                    "image/png" => "png",
                    "image/webp" => "webp",
                    "image/gif" => "gif",
                    _ => "jpg",
                };
                let fname = format!("{idx:03}.{ext}");
                let fpath = chap_dir.join(&fname);
                if fs::write(&fpath, &bytes).is_ok() {
                    saved_count += 1;
                }
                if let Some(ref mut zw) = zip_writer {
                    if zw.start_file(&fname, zip_opts).is_ok() {
                        let _ = zw.write_all(&bytes);
                    }
                }
            }
            if let Some(mut zw) = zip_writer {
                let _ = zw.finish();
            }

            responder.respond(json_ok_response(&DownloadChapterResponse {
                ok: saved_count > 0,
                dir: chap_dir.to_string_lossy().to_string(),
                cbz: cbz_path.to_string_lossy().to_string(),
                count: saved_count,
                error: if saved_count == 0 {
                    Some("Failed to download pages".to_string())
                } else {
                    None
                },
            }));
            return;
        }

        if path.ends_with("/open-folder") {
            if let Ok(payload) = serde_json::from_slice::<OpenFolderPayload>(&body_bytes) {
                let target = if payload.path.is_empty() {
                    downloads_dir()
                } else {
                    PathBuf::from(&payload.path)
                };
                let _ = Command::new("explorer.exe").arg(target).spawn();
            }
            responder.respond(json_ok_response(&serde_json::json!({ "ok": true })));
            return;
        }

        let parsed: Result<ProxyPayload, _> = serde_json::from_slice(&body_bytes);
        let payload = match parsed {
            Ok(p) => p,
            Err(e) => {
                let resp = Response::builder()
                    .status(StatusCode::OK)
                    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                    .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "x-upstream-status")
                    .header("x-upstream-status", "400")
                    .body(Cow::Owned(format!("Invalid proxy JSON: {e}").into_bytes()))
                    .unwrap();
                responder.respond(resp);
                return;
            }
        };

        let opts = payload.opts.unwrap_or_default();
        let method = opts.method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
        let is_md = payload.url.contains("mangadex.org") || payload.url.contains("mangadex.network");
        let is_remanga = payload.url.contains("remanga.org") || payload.url.contains("re-manga.org");
        let ua = if is_md { MANGADEX_UA } else { CHROME_UA };

        let mut ureq_req = http_agent().request(&method, &payload.url);
        ureq_req = ureq_req
            .set("User-Agent", ua)
            .set("Accept", "application/json, text/html, */*;q=0.8")
            .set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");

        let mut curl_headers = vec![
            ("User-Agent".to_string(), ua.to_string()),
            (
                "Accept".to_string(),
                "application/json, text/html, */*;q=0.8".to_string(),
            ),
            (
                "Accept-Language".to_string(),
                "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7".to_string(),
            ),
        ];

        if let Some(hdrs) = opts.headers {
            for (k, v) in hdrs {
                if is_md {
                    let lk = k.to_ascii_lowercase();
                    if lk == "referer" || lk == "origin" || lk == "user-agent" {
                        continue;
                    }
                }
                ureq_req = ureq_req.set(&k, &v);
                curl_headers.push((k, v));
            }
        }

        let result = if let Some(ref b) = opts.body {
            ureq_req.send_string(b)
        } else {
            ureq_req.call()
        };

        let (mut status_code, mut resp_bytes) = match result {
            Ok(resp) => {
                let code = resp.status();
                let mut buf = Vec::new();
                let _ = resp.into_reader().take(20 * 1024 * 1024).read_to_end(&mut buf);
                (code, buf)
            }
            Err(ureq::Error::Status(code, resp)) => {
                let mut buf = Vec::new();
                let _ = resp.into_reader().take(5 * 1024 * 1024).read_to_end(&mut buf);
                (code, buf)
            }
            Err(ureq::Error::Transport(t)) => (502, format!("Transport error: {t}").into_bytes()),
        };

        if status_code == 403 || status_code == 502 || status_code == 503 {
            if let Some((c_code, c_bytes)) = curl_fetch(
                &payload.url,
                &method,
                &curl_headers,
                opts.body.as_deref(),
                is_remanga,
            ) {
                if (200..400).contains(&c_code) {
                    status_code = c_code;
                    resp_bytes = c_bytes;
                }
            }
            if (status_code == 403 || status_code == 502) && is_remanga {
                if let Some((c_code, c_bytes)) = curl_fetch(
                    &payload.url,
                    &method,
                    &curl_headers,
                    opts.body.as_deref(),
                    false,
                ) {
                    if (200..400).contains(&c_code) {
                        status_code = c_code;
                        resp_bytes = c_bytes;
                    }
                }
            }
        }

        let resp = Response::builder()
            .status(StatusCode::OK)
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "x-upstream-status")
            .header("x-upstream-status", status_code.to_string())
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(Cow::Owned(resp_bytes))
            .unwrap();
        responder.respond(resp);
    });
}

fn handle_mimg_async(req: http::Request<Vec<u8>>, responder: RequestAsyncResponder) {
    let uri_str = req.uri().to_string();
    rayon::spawn(move || {
        let parsed = Url::parse(&uri_str).or_else(|_| Url::parse(&format!("http://mimg.localhost{uri_str}")));
        let Ok(url_obj) = parsed else {
            responder.respond(
                Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(Cow::Borrowed(&b"Bad URL"[..]))
                    .unwrap(),
            );
            return;
        };

        let mut target_url = String::new();
        let mut referer = String::new();
        let mut up_mode = String::from("off");

        for (k, v) in url_obj.query_pairs() {
            match k.as_ref() {
                "u" => target_url = v.into_owned(),
                "r" => referer = v.into_owned(),
                "up" => up_mode = v.into_owned(),
                _ => {}
            }
        }

        if target_url.is_empty() {
            responder.respond(
                Response::builder()
                    .status(StatusCode::BAD_REQUEST)
                    .body(Cow::Borrowed(&b"Missing u param"[..]))
                    .unwrap(),
            );
            return;
        }

        match get_or_fetch_page_bytes(&target_url, Some(&referer), &up_mode) {
            Ok(final_bytes) => {
                let mime = guess_mime(&target_url, &final_bytes);
                responder.respond(
                    Response::builder()
                        .status(StatusCode::OK)
                        .header(header::CONTENT_TYPE, mime)
                        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                        .header(header::CACHE_CONTROL, "public, max-age=86400")
                        .body(Cow::Owned(final_bytes))
                        .unwrap(),
                );
            }
            Err(e) => {
                responder.respond(
                    Response::builder()
                        .status(StatusCode::BAD_GATEWAY)
                        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                        .body(Cow::Owned(format!("Image fetch failed: {e}").into_bytes()))
                        .unwrap(),
                );
            }
        }
    });
}

fn main() -> wry::Result<()> {
    let _ = rayon::ThreadPoolBuilder::new().num_threads(6).build_global();

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("MangaReader")
        .with_window_icon(render_window_icon(64))
        .with_inner_size(LogicalSize::new(1280.0, 820.0))
        .with_min_inner_size(LogicalSize::new(900.0, 600.0))
        .with_theme(Some(Theme::Dark))
        .build(&event_loop)
        .expect("Failed to create window");

    let _webview = WebViewBuilder::new()
        .with_initialization_script("window.__RUST_BACKEND__ = true;")
        .with_custom_protocol("app".into(), |_id, req| handle_app_request(req))
        .with_asynchronous_custom_protocol("mhttp".into(), |_id, req, responder| {
            handle_mhttp_async(req, responder);
        })
        .with_asynchronous_custom_protocol("mimg".into(), |_id, req, responder| {
            handle_mimg_async(req, responder);
        })
        .with_url("http://app.localhost/index.html")
        .build(&window)?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}
