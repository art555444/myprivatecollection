"""Uebersetzt die Titel aller bestehenden Boxen in script_cleaned.js ins
Deutsche. Titel, die bereits deutsch sind, werden uebersprungen. Fuegt keine
Links hinzu und loescht keine (dafuer siehe add_links.py / remove_links.py).

Einfach in VS Code mit dem Play-Button starten.
"""

import json
import re
import shutil
import time
import requests

from link_common import (
    INPUT_JS_FILE,
    REQUEST_HEADERS,
    print_section,
    clean_text,
    get_field,
    replace_field,
    load_video_objects,
    save_video_objects,
)

# --- Einstellungen -----------------------------------------------------------

# Nur anzeigen, was passieren wuerde, ohne script_cleaned.js zu veraendern.
DRY_RUN = False

# Zusaetzlich zu den Titeln auch die Beschreibungen uebersetzen.
TRANSLATE_DESCRIPTIONS = False

# Sicherheitskopie vor dem ersten Schreiben.
BACKUP_FILE = INPUT_JS_FILE + ".bak"

# Bewusst clients5.google.com und nicht translate.googleapis.com: letzterer
# antwortet ohne API-Key nur noch mit einer "Sorry..."-Sperrseite.
TRANSLATE_URL = "https://clients5.google.com/translate_a/t"
TARGET_LANG = "de"
REQUEST_TIMEOUT = 12
REQUEST_DELAY = 0.35
TRANSLATE_ATTEMPTS = 3
TRANSLATE_RETRY_DELAY = 2.0

# Nach so vielen Fehlschlaegen hintereinander ist eher der Dienst blockiert als
# der einzelne Titel kaputt -> sauber abbrechen und das bisher Uebersetzte
# behalten, statt hunderte Titel unnoetig durchzurattern.
MAX_CONSECUTIVE_FAILURES = 8

# Zwischenspeichern, damit ein Abbruch (Strg+C, Netzwerk) nicht die ganze
# Arbeit des Laufs verwirft.
SAVE_EVERY = 25

# --- Spracherkennung ohne Netzwerk ------------------------------------------

# Woerter, die praktisch nur im Deutschen vorkommen. Bewusst kurz gehalten:
# alles, was auch englisch/italienisch sein koennte ("in", "man", "war"),
# fehlt hier absichtlich.
GERMAN_MARKERS = {
    "der", "die", "das", "den", "dem", "des", "und", "oder", "aber", "mit",
    "beim", "bei", "vom", "zum", "zur", "auf", "aus", "fuer", "für", "über",
    "unter", "nach", "vor", "gegen", "ohne", "durch", "ist", "sind", "wird",
    "wurde", "werden", "hat", "haben", "sich", "nicht", "noch", "auch", "sehr",
    "mehr", "ihre", "ihren", "seine", "seinen", "mein", "meine", "meinen",
    "dein", "deine", "erste", "ersten", "geil", "geile", "geilen", "geiles",
    "stief", "schwanz", "muschi", "titten", "maedchen", "mädchen", "freundin",
    "ehefrau", "gefickt", "ficken", "fickt", "wichst", "spritzt", "besorgt",
    "kleine", "kleiner", "kleines", "grosse", "große", "junge", "jungen",
    "heisse", "heiße", "blondine", "nachbarin", "stiefschwester",
    "stiefbruder", "stiefmutter", "stiefvater", "stieftochter", "stiefsohn",
}

# Woerter, die klar auf eine andere Sprache zeigen (englisch + romanisch).
FOREIGN_MARKERS = {
    # Englisch
    "the", "and", "with", "for", "his", "her", "she", "he", "they", "you",
    "your", "this", "that", "these", "those", "from", "after", "before",
    "while", "into", "gets", "get", "got", "getting", "fucks", "fucked",
    "fucking", "sucks", "sucked", "sucking", "step", "stepsis", "stepmom",
    "stepbro", "stepson", "stepdad", "wife", "girlfriend", "neighbor",
    "neighbour", "cheating", "caught", "catches", "teaches", "helps", "wants",
    "loves", "likes", "makes", "takes", "gives", "first", "time", "little",
    "young", "hot", "big", "huge", "hard", "deep", "best", "friend", "friends",
    # Italienisch / Spanisch / Franzoesisch / Portugiesisch
    "il", "lo", "la", "gli", "le", "un", "una", "uno", "di", "del", "della",
    "che", "con", "per", "mia", "mio", "sua", "suo", "non", "come", "molto",
    "sorella", "fratello", "matrigna", "moglie", "ragazza", "el", "los", "las",
    "y", "con", "para", "mi", "su", "hermana", "hermano", "esposa", "chica",
    "et", "avec", "pour", "mon", "ma", "sa", "belle", "soeur", "femme",
    "com", "para", "minha", "meu", "irma", "esposa",
}

WORD_PATTERN = re.compile(r"[a-zA-ZäöüÄÖÜßàèéìòùáíóúñçâêîôû]+")


def looks_clearly_german(text):
    """Schnellpruefung ohne Netzwerk. Sagt nur dann 'deutsch', wenn es
    eindeutig ist: mehrere deutsche Marker und kein einziger fremdsprachiger.
    Alles andere entscheidet die Spracherkennung des Uebersetzungsdienstes."""
    words = [w.lower() for w in WORD_PATTERN.findall(text)]
    if not words:
        return False

    german_hits = sum(1 for w in words if w in GERMAN_MARKERS)
    foreign_hits = sum(1 for w in words if w in FOREIGN_MARKERS)

    if any(ch in text for ch in "äöüÄÖÜß"):
        german_hits += 1

    return german_hits >= 2 and foreign_hits == 0


# --- Uebersetzung ------------------------------------------------------------

def extract_translation(payload):
    """Der Endpunkt antwortet je nach Textlaenge unterschiedlich:
    [["Text","en"]] bei kurzen Texten, [[["Teil1"],["Teil2"]],"en"] wenn er in
    Segmente zerlegt. Beide Formen werden hier auf (Text, Sprache) gebracht."""
    if not isinstance(payload, list) or not payload:
        return None, None

    first = payload[0]
    lang = payload[1] if len(payload) > 1 and isinstance(payload[1], str) else None

    if isinstance(first, str):
        return first, lang

    if isinstance(first, list):
        if len(first) >= 2 and isinstance(first[0], str) and isinstance(first[1], str):
            return first[0], first[1]

        parts = []
        for segment in first:
            if isinstance(segment, str):
                parts.append(segment)
            elif isinstance(segment, list) and segment and isinstance(segment[0], str):
                parts.append(segment[0])
        if parts:
            return "".join(parts), lang

    return None, None


def translate_to_german(text):
    """Liefert (uebersetzter_text, erkannte_sprache) oder (None, None) bei
    Fehlschlag. Die erkannte Sprache kommt vom Dienst selbst - dadurch werden
    bereits deutsche Titel zuverlaessig erkannt und nicht angefasst."""
    params = {
        "client": "dict-chrome-ex",
        "sl": "auto",
        "tl": TARGET_LANG,
        "q": text,
    }

    for attempt in range(TRANSLATE_ATTEMPTS):
        try:
            response = requests.get(
                TRANSLATE_URL,
                params=params,
                headers=REQUEST_HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            if response.status_code == 200:
                translated, lang = extract_translation(json.loads(response.text))
                if translated:
                    return translated, lang
        except Exception:
            pass

        if attempt < TRANSLATE_ATTEMPTS - 1:
            time.sleep(TRANSLATE_RETRY_DELAY * (attempt + 1))

    return None, None


def translate_field(obj, field_name, stats):
    """Uebersetzt ein einzelnes Feld der Box und liefert das (ggf.) geaenderte
    Objekt zurueck. stats wird dabei mitgezaehlt."""
    original = get_field(obj, field_name)

    if not original.strip():
        stats["skipped_empty"] += 1
        return obj, True

    if looks_clearly_german(original):
        print(f"  bereits deutsch (ohne Anfrage) -> übersprungen: {original}")
        stats["skipped_german"] += 1
        return obj, True

    translated, lang = translate_to_german(original)

    if translated is None:
        print(f"  FEHLGESCHLAGEN -> unverändert: {original}")
        stats["failed"] += 1
        stats["failed_texts"].append(original)
        return obj, False

    if lang == TARGET_LANG:
        print(f"  bereits deutsch -> übersprungen: {original}")
        stats["skipped_german"] += 1
        return obj, True

    new_value = clean_text(translated)

    if not new_value or new_value == original:
        print(f"  keine Änderung: {original}")
        stats["unchanged"] += 1
        return obj, True

    print(f"  [{lang or '??'}] {original}")
    print(f"     -> {new_value}")
    stats["translated"] += 1
    return replace_field(obj, field_name, new_value), True


def make_stats():
    return {
        "translated": 0,
        "skipped_german": 0,
        "skipped_empty": 0,
        "unchanged": 0,
        "failed": 0,
        "failed_texts": [],
    }


def create_backup():
    if DRY_RUN:
        return
    try:
        shutil.copyfile(INPUT_JS_FILE, BACKUP_FILE)
        print(f"Sicherheitskopie angelegt: {BACKUP_FILE}")
    except Exception as e:
        print(f"WARNUNG: Sicherheitskopie konnte nicht angelegt werden: {e}")


def store(objects, content, start, end):
    if DRY_RUN:
        return
    save_video_objects(objects, content, start, end)


def main():
    objects, content, start, end = load_video_objects()
    if objects is None:
        return

    fields = ["title"] + (["description"] if TRANSLATE_DESCRIPTIONS else [])

    print_section("ÜBERSETZE TITEL INS DEUTSCHE")
    print(f"Boxen gesamt: {len(objects)}")
    if DRY_RUN:
        print("DRY_RUN aktiv - es wird nichts gespeichert.")
    else:
        create_backup()

    stats = make_stats()
    consecutive_failures = 0
    aborted = False

    try:
        for index, obj in enumerate(objects):
            print(f"\n[{index + 1}/{len(objects)}] {get_field(obj, 'id')}")

            for field_name in fields:
                obj, ok = translate_field(obj, field_name, stats)

                if ok:
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                        print_section("ABBRUCH - ÜBERSETZUNGSDIENST NICHT ERREICHBAR")
                        print(f"{MAX_CONSECUTIVE_FAILURES} Fehlschläge hintereinander.")
                        print("Bereits übersetzte Titel werden gespeichert.")
                        print("Später einfach erneut starten - fertige Titel werden übersprungen.")
                        aborted = True
                        break

                time.sleep(REQUEST_DELAY)

            objects[index] = obj

            if aborted:
                break

            if (index + 1) % SAVE_EVERY == 0:
                store(objects, content, start, end)

    except KeyboardInterrupt:
        print("\nAbgebrochen - bisheriger Stand wird gespeichert.")
        aborted = True

    store(objects, content, start, end)

    print_section("FERTIG")
    print(f"Übersetzt: {stats['translated']}")
    print(f"Bereits deutsch übersprungen: {stats['skipped_german']}")
    print(f"Leere Felder übersprungen: {stats['skipped_empty']}")
    print(f"Ohne Änderung: {stats['unchanged']}")
    print(f"Fehlgeschlagen: {stats['failed']}")
    if stats["failed_texts"]:
        print("Fehlgeschlagen (unverändert geblieben):")
        for text in stats["failed_texts"]:
            print(f"  - {text}")
        print("Script einfach nochmal starten, um diese erneut zu versuchen.")
    if aborted:
        print("HINWEIS: Lauf wurde vorzeitig beendet.")
    if DRY_RUN:
        print("DRY_RUN war aktiv - script_cleaned.js wurde nicht verändert.")


if __name__ == "__main__":
    main()
