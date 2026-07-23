"""Prueft alle bestehenden Boxen in script_cleaned.js auf Verfuegbarkeit und
kuemmert sich um fehlende/lokale Thumbnails. Fuegt KEINE neuen Links hinzu
(dafuer siehe add_links.py)."""

import os

from link_common import (
    THUMBS_DIR,
    FALLBACK_THUMBNAIL,
    print_section,
    normalize_url,
    verify_environment,
    fetch_video_info,
    is_video_available,
    parse_video_info,
    download_thumbnail_from_candidates,
    is_local_thumbnail_present,
    get_field,
    replace_field,
    load_video_objects,
    save_video_objects,
)

# Wenn in einem Lauf mehr als dieser Anteil der bestehenden Boxen als "nicht
# verfuegbar" erkannt wird, ist das eher ein Zeichen fuer ein technisches
# Problem (Netzwerk, fehlende Abhaengigkeit, Blockade) als fuer echte
# geloeschte Videos -> Abbruch ohne zu speichern, statt die Sammlung zu leeren.
SAFETY_MAX_REMOVED_RATIO = 0.25


def process_existing_objects(existing_objects):
    kept_objects = []

    removed_old_videos = 0
    recovered_real_thumbnails = 0
    unchanged_fallbacks = 0
    unchanged_local_ok = 0

    print_section("PRÜFE ALTE BOXEN")

    for obj in existing_objects:
        url = normalize_url(get_field(obj, "url"))
        current_thumbnail = get_field(obj, "thumbnail")
        video_id_field = get_field(obj, "id") or f"custom-{len(kept_objects) + 1}"

        if not url:
            print("Objekt ohne URL -> übersprungen")
            continue

        print(f"Prüfe altes Video: {url}")

        if is_local_thumbnail_present(current_thumbnail):
            if not is_video_available(url):
                print("VIDEO NICHT VERFÜGBAR -> BOX GELÖSCHT")
                removed_old_videos += 1
                continue
            print("Thumbnail lokal vorhanden -> OK")
            unchanged_local_ok += 1
            kept_objects.append(obj)
            continue

        # Kein gültiges lokales Thumbnail -> Video-Infos frisch holen (deckt
        # Verfügbarkeits-Check und Thumbnail-Quelle in einem Request ab)
        info = fetch_video_info(url)
        if info is None:
            print("VIDEO NICHT VERFÜGBAR -> BOX GELÖSCHT")
            removed_old_videos += 1
            continue

        parsed = parse_video_info(info)
        local_thumb = download_thumbnail_from_candidates(info, url, video_id_field)

        if local_thumb:
            obj = replace_field(obj, "thumbnail", local_thumb)
            recovered_real_thumbnails += 1
            print("ECHTES THUMBNAIL LOKAL GESPEICHERT")
        else:
            obj = replace_field(obj, "thumbnail", FALLBACK_THUMBNAIL)
            unchanged_fallbacks += 1
            print("Kein Thumbnail erhältlich -> Ersatzbild gesetzt")

        kept_objects.append(obj)

    return {
        "objects": kept_objects,
        "removed_old_videos": removed_old_videos,
        "recovered_real_thumbnails": recovered_real_thumbnails,
        "unchanged_fallbacks": unchanged_fallbacks,
        "unchanged_local_ok": unchanged_local_ok
    }


def main():
    verify_environment()

    os.makedirs(THUMBS_DIR, exist_ok=True)

    existing_objects, content, start, end = load_video_objects()
    if existing_objects is None:
        return

    total_before = len(existing_objects)

    result = process_existing_objects(existing_objects)

    removed = result["removed_old_videos"]
    if total_before > 5 and removed / total_before > SAFETY_MAX_REMOVED_RATIO:
        print_section("ABBRUCH - SICHERHEITSSPERRE")
        print(f"{removed} von {total_before} Videos wurden als 'nicht verfügbar' erkannt "
              f"(> {int(SAFETY_MAX_REMOVED_RATIO * 100)}%).")
        print("Das deutet eher auf ein technisches Problem (Netzwerk, Blockade, fehlende")
        print("Abhängigkeit) hin als auf echte gelöschte Videos. Es wurde NICHTS gespeichert,")
        print("script_cleaned.js bleibt unverändert. Prüfe die Fehlermeldungen oben und starte danach neu.")
        return

    save_video_objects(result["objects"], content, start, end)

    print_section("FERTIG")
    print(f"Alte Boxen gelöscht: {result['removed_old_videos']}")
    print(f"Lokale Thumbnails bereits vorhanden (unverändert): {result['unchanged_local_ok']}")
    print(f"Echte Thumbnails neu lokal gespeichert: {result['recovered_real_thumbnails']}")
    print(f"Ersatzbilder beibehalten/gesetzt (alt): {result['unchanged_fallbacks']}")
    print(f"Gesamt verbleibende Boxen: {len(result['objects'])}")


if __name__ == "__main__":
    main()
