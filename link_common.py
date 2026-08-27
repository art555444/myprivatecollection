"""Gemeinsame Funktionen fuer check_links.py und add_links.py.

Enthaelt alles, was beide Skripte brauchen: yt-dlp/Netzwerk-Handling,
Thumbnail-Download, Text-Utilities und das Parsen/Schreiben des
`videos`-Arrays in script_cleaned.js.
"""

import glob
import os
import re
import time
import requests

INPUT_JS_FILE = "script_cleaned.js"
OUTPUT_FILE = "script_cleaned.js"

THUMBS_DIR = "images/thumbs"
FALLBACK_THUMBNAIL = "images/no-thumbnail.jpg"
THUMBNAIL_TIMEOUT = 10
THUMBNAIL_ATTEMPTS = 3
THUMBNAIL_RETRY_DELAY = 1.5

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}
EXT_BY_CONTENT_TYPE = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def print_section(title):
    print(f"\n{'=' * 12} {title} {'=' * 12}")


def normalize_url(url):
    if not url:
        return ""
    url = url.strip()
    url = url.rstrip(".,;)")
    url = url.rstrip("/")
    return url


def extract_urls(text):
    raw_urls = re.findall(r'https?://[^\s"\']+', text)
    cleaned = []
    seen = set()

    for url in raw_urls:
        normalized = normalize_url(url)
        if normalized and normalized not in seen:
            seen.add(normalized)
            cleaned.append(normalized)

    return cleaned


def clean_text(text):
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
            .replace('"', "'")
            .replace("\n", " ")
            .replace("\r", " ")
            .replace("\t", " ")
            .strip()
    )


def truncate_text(text, max_length=150):
    if len(text) <= max_length:
        return text
    return text[: max_length - 3].rstrip() + "..."


def get_ydl():
    from yt_dlp import YoutubeDL
    from yt_dlp.networking.impersonate import ImpersonateTarget
    return YoutubeDL({
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
        "extract_flat": False,
        "socket_timeout": 12,
        "http_headers": REQUEST_HEADERS,
        "impersonate": ImpersonateTarget.from_str("chrome")
    })


def verify_environment():
    """Bricht sofort ab, bevor irgendeine Box angefasst wird, falls yt-dlp die
    Chrome-Impersonation technisch nicht nutzen kann (z.B. curl_cffi fehlt/kaputt).
    Ohne diesen Check wuerde jeder Verfuegbarkeits-Check fehlschlagen und jede
    Box faelschlich als "nicht verfuegbar" geloescht werden."""
    from yt_dlp.utils import YoutubeDLError
    try:
        with get_ydl():
            pass
    except YoutubeDLError as e:
        print_section("ABBRUCH - UMGEBUNG NICHT BEREIT")
        print(str(e))
        print("Es wurde nichts veraendert. Installiere/aktualisiere: python3 -m pip install -U curl_cffi")
        raise SystemExit(1)


def fetch_video_info(url):
    """Single yt-dlp call. Returns the raw info dict, or None if the video is unavailable."""
    try:
        with get_ydl() as ydl:
            return ydl.extract_info(url, download=False)
    except Exception as e:
        print(f"Video nicht verfuegbar ({url}): {e}")
        return None


def is_video_available(url):
    return fetch_video_info(url) is not None


def parse_video_info(info):
    title = clean_text(info.get("title", "Ohne Titel"))
    description = clean_text(info.get("description", ""))

    if not description:
        description = title
    description = truncate_text(description, 150)

    return {
        "title": title or "Ohne Titel",
        "description": description or "Ohne Beschreibung",
    }


def clear_existing_thumb_files(filename_base):
    for f in glob.glob(f"{THUMBS_DIR}/{filename_base}.*"):
        try:
            os.remove(f)
        except OSError:
            pass


def get_thumbnail_candidates(info):
    """Liefert Thumbnail-URLs von der besten (yt-dlps eigene Auswahl) bis zur
    schlechtesten Aufloesung. Schlaegt die beste URL fehl (z.B. weil genau diese
    Variante serverseitig blockiert ist), wird automatisch die naechste
    versucht statt sofort aufzugeben."""
    candidates = []
    seen = set()

    best = info.get("thumbnail")
    if best:
        candidates.append(best)
        seen.add(best)

    # yt-dlp sortiert thumbnails von niedrigster zu hoechster Praeferenz
    for thumb in reversed(info.get("thumbnails") or []):
        thumb_url = thumb.get("url")
        if thumb_url and thumb_url not in seen:
            seen.add(thumb_url)
            candidates.append(thumb_url)

    return candidates


def guess_ext_from_bytes(data):
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return ".gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"


def looks_like_image(data):
    """Fallback-Erkennung ueber Magic Bytes, falls ein Server bei Bildern
    einen falschen/generischen Content-Type wie application/octet-stream
    sendet - das wuerde sonst ein gueltiges Thumbnail unnoetig verwerfen."""
    if not data or len(data) < 12:
        return False
    return guess_ext_from_bytes(data) != ".jpg" or data.startswith(b"\xff\xd8\xff")


def download_thumbnail(url, filename_base, referer=None):
    if not url:
        return None

    headers = dict(REQUEST_HEADERS)
    if referer:
        headers["Referer"] = referer

    try:
        response = requests.get(
            url,
            timeout=THUMBNAIL_TIMEOUT,
            headers=headers,
            allow_redirects=True
        )
        if response.status_code != 200:
            return None

        content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
        is_image = content_type.startswith("image/") or looks_like_image(response.content)
        if not is_image:
            return None

        os.makedirs(THUMBS_DIR, exist_ok=True)
        clear_existing_thumb_files(filename_base)
        ext = EXT_BY_CONTENT_TYPE.get(content_type) or guess_ext_from_bytes(response.content)
        local_path = f"{THUMBS_DIR}/{filename_base}{ext}"

        with open(local_path, "wb") as f:
            f.write(response.content)

        return local_path
    except Exception:
        return None


def download_thumbnail_via_ytdlp(page_url, filename_base):
    """Letzter Ausweg: yt-dlp selbst das Thumbnail herunterladen lassen.
    yt-dlp nutzt dieselbe Chrome-Impersonation/Header-Behandlung, mit der der
    Seitenzugriff fuer die Video-Infos bereits erfolgreich war. Ein simpler
    requests-Download ohne diese Technik scheitert bei manchen Hostern am
    Hotlink-Schutz (403), obwohl das Thumbnail eigentlich erreichbar ist."""
    os.makedirs(THUMBS_DIR, exist_ok=True)
    clear_existing_thumb_files(filename_base)
    outtmpl = f"{THUMBS_DIR}/{filename_base}.%(ext)s"
    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "no_warnings": True,
        "writethumbnail": True,
        "outtmpl": outtmpl,
        "socket_timeout": THUMBNAIL_TIMEOUT,
        "http_headers": REQUEST_HEADERS,
        "impersonate": ImpersonateTarget.from_str("chrome"),
    }
    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([page_url])
    except Exception:
        pass

    for f in glob.glob(f"{THUMBS_DIR}/{filename_base}.*"):
        return f
    return None


def download_thumbnail_from_candidates(info, page_url, filename_base):
    for candidate_url in get_thumbnail_candidates(info):
        for attempt in range(THUMBNAIL_ATTEMPTS):
            local_path = download_thumbnail(candidate_url, filename_base, referer=page_url)
            if local_path:
                return local_path
            if attempt < THUMBNAIL_ATTEMPTS - 1:
                time.sleep(THUMBNAIL_RETRY_DELAY)

    return download_thumbnail_via_ytdlp(page_url, filename_base)


def is_local_thumbnail_present(thumbnail):
    return (
        bool(thumbnail)
        and thumbnail != FALLBACK_THUMBNAIL
        and thumbnail.startswith(THUMBS_DIR + "/")
        and os.path.isfile(thumbnail)
    )


def split_objects(array_text):
    objects = []
    depth = 0
    start = None
    in_string = False
    escape = False
    string_char = ""

    for i, ch in enumerate(array_text):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == string_char:
                in_string = False
        else:
            if ch in ('"', "'"):
                in_string = True
                string_char = ch
            elif ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start is not None:
                    objects.append(array_text[start:i + 1])
                    start = None

    return objects


def get_existing_array(content):
    match = re.search(
        r'const\s+videos\s*=\s*\[(.*?)\]\s*;',
        content,
        re.DOTALL
    )
    if not match:
        return None, None, None
    return match.group(1), match.start(), match.end()


def get_field(obj, field_name):
    match = re.search(rf'{field_name}\s*:\s*"([^"]*)"', obj)
    return match.group(1).strip() if match else ""


def replace_field(obj, field_name, new_value):
    pattern = rf'({field_name}\s*:\s*")([^"]*)(")'
    if re.search(pattern, obj):
        # Lambda statt Replacement-String: sonst wuerde ein Backslash oder eine
        # Zeichenfolge wie \1 im neuen Text von re.sub selbst interpretiert.
        return re.sub(pattern, lambda m: m.group(1) + new_value + m.group(3), obj)
    return obj


def get_existing_urls(objects):
    urls = set()
    for obj in objects:
        url = normalize_url(get_field(obj, "url"))
        if url:
            urls.add(url)
    return urls


def get_highest_id(objects):
    max_id = 0
    for obj in objects:
        match = re.search(r'id\s*:\s*"custom-(\d+)"', obj)
        if match:
            num = int(match.group(1))
            if num > max_id:
                max_id = num
    return max_id


def detect_channel(url):
    u = url.lower()
    if "pornhub" in u:
        return "Pornhub"
    if "youtube.com" in u or "youtu.be" in u:
        return "YouTube"
    if "xvideos" in u:
        return "XVideos"
    if "xhamster" in u:
        return "xHamster"
    if "redtube" in u:
        return "RedTube"
    return "Auto"


def build_video_block(video_id, title, description, thumbnail, url, channel):
    title = clean_text(title)
    description = clean_text(description)
    thumbnail = clean_text(thumbnail)
    url = clean_text(url)
    channel = clean_text(channel)

    return f'''  {{
    id: "custom-{video_id}",
    title: "{title}",
    description: "{description}",
    channel: "{channel}",
    platform: "custom",
    thumbnail: "{thumbnail}",
    url: "{url}"
  }}'''


def load_video_objects():
    """Liest INPUT_JS_FILE und liefert (objects, content, start, end).
    Bei Fehlern wird (None, ...) zurueckgegeben, die Fehlermeldung ist bereits gedruckt."""
    try:
        with open(INPUT_JS_FILE, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"FEHLER: {INPUT_JS_FILE} nicht gefunden.")
        return None, None, None, None

    array_inner, start, end = get_existing_array(content)

    if array_inner is None:
        print("FEHLER: videos-Array nicht gefunden.")
        return None, None, None, None

    return split_objects(array_inner), content, start, end


def save_video_objects(objects, content, start, end):
    new_array = "const videos = [\n" + ",\n".join(objects) + "\n];"
    new_content = content[:start] + new_array + content[end:]

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(new_content)
