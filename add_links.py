"""Liest neue Links aus links.txt, prueft sie und fuegt sie als neue Boxen in
script_cleaned.js ein. Ruehrt bestehende Boxen NICHT an (dafuer siehe
check_links.py)."""

import os

from link_common import (
    THUMBS_DIR,
    FALLBACK_THUMBNAIL,
    print_section,
    extract_urls,
    verify_environment,
    fetch_video_info,
    parse_video_info,
    download_thumbnail_from_candidates,
    get_existing_urls,
    get_highest_id,
    detect_channel,
    build_video_block,
    load_video_objects,
    save_video_objects,
)

INPUT_LINKS_FILE = "links.txt"


def process_new_links(existing_objects, existing_urls):
    current_max_id = get_highest_id(existing_objects)

    print_section("LESE NEUE LINKS AUS links.txt")

    try:
        with open(INPUT_LINKS_FILE, "r", encoding="utf-8") as f:
            links_text = f.read()
    except FileNotFoundError:
        links_text = ""

    new_urls = extract_urls(links_text)

    added_count = 0
    duplicate_count = 0
    invalid_count = 0
    fallback_new_thumbnails = 0
    failed_urls = []

    if not new_urls:
        print("Keine neuen Links gefunden.")

    for url in new_urls:
        if url in existing_urls:
            print(f"Schon vorhanden -> übersprungen: {url}")
            duplicate_count += 1
            continue

        print(f"Prüfe neuen Link: {url}")

        info = fetch_video_info(url)
        if info is None:
            print("NEUES VIDEO NICHT VERFÜGBAR -> übersprungen (bleibt in links.txt)")
            invalid_count += 1
            failed_urls.append(url)
            continue

        parsed = parse_video_info(info)
        current_max_id += 1
        video_id_field = f"custom-{current_max_id}"

        thumbnail = download_thumbnail_from_candidates(info, url, video_id_field)
        if thumbnail:
            print("Echtes Thumbnail lokal gespeichert")
        else:
            thumbnail = FALLBACK_THUMBNAIL
            fallback_new_thumbnails += 1
            print("Kein Thumbnail erhältlich -> Ersatzbild gesetzt")

        channel = detect_channel(url)

        new_object = build_video_block(
            video_id=current_max_id,
            title=parsed["title"],
            description=parsed["description"],
            thumbnail=thumbnail,
            url=url,
            channel=channel
        )

        existing_objects.append(new_object)
        existing_urls.add(url)
        added_count += 1
        print("NEUE BOX HINZUGEFÜGT")

    return {
        "objects": existing_objects,
        "added_count": added_count,
        "duplicate_count": duplicate_count,
        "invalid_count": invalid_count,
        "fallback_new_thumbnails": fallback_new_thumbnails,
        "failed_urls": failed_urls
    }


def rewrite_links_file(remaining_urls):
    try:
        with open(INPUT_LINKS_FILE, "w", encoding="utf-8") as f:
            if remaining_urls:
                f.write("\n".join(remaining_urls) + "\n")
        if remaining_urls:
            print(f"links.txt: {len(remaining_urls)} fehlgeschlagene(r) Link(s) bleiben zum Wiederholen erhalten.")
        else:
            print("links.txt wurde geleert.")
    except Exception as e:
        print(f"links.txt konnte nicht aktualisiert werden: {e}")


def main():
    verify_environment()

    os.makedirs(THUMBS_DIR, exist_ok=True)

    existing_objects, content, start, end = load_video_objects()
    if existing_objects is None:
        return

    existing_urls = get_existing_urls(existing_objects)

    result = process_new_links(existing_objects, existing_urls)

    save_video_objects(result["objects"], content, start, end)

    rewrite_links_file(result["failed_urls"])

    print_section("FERTIG")
    print(f"Neue Boxen hinzugefügt: {result['added_count']}")
    print(f"Doppelte neue Links übersprungen: {result['duplicate_count']}")
    print(f"Ungültige neue Links übersprungen: {result['invalid_count']}")
    print(f"Neue Boxen mit Ersatzbild (kein Thumbnail erhältlich): {result['fallback_new_thumbnails']}")
    print(f"Gesamt verbleibende Boxen: {len(result['objects'])}")


if __name__ == "__main__":
    main()
