"""Öffnet ein Fenster zum Einfügen von Issue-Text, extrahiert daraus URLs und
entfernt die passenden Boxen (inkl. lokaler Thumbnails) aus script_cleaned.js.
Rührt keine anderen Boxen an (dafür siehe add_links.py / check_links.py)."""

import tkinter as tk
from tkinter import scrolledtext

from link_common import (
    print_section,
    extract_urls,
    normalize_url,
    get_field,
    clear_existing_thumb_files,
    load_video_objects,
    save_video_objects,
)


def remove_links(urls_to_remove):
    existing_objects, content, start, end = load_video_objects()
    if existing_objects is None:
        return None

    urls_to_remove = {normalize_url(u) for u in urls_to_remove}

    kept_objects = []
    removed_urls = []

    for obj in existing_objects:
        url = normalize_url(get_field(obj, "url"))
        if url in urls_to_remove:
            video_id = get_field(obj, "id")
            if video_id:
                clear_existing_thumb_files(video_id)
            removed_urls.append(url)
            print(f"Box gelöscht: {url}")
            continue
        kept_objects.append(obj)

    save_video_objects(kept_objects, content, start, end)

    not_found = sorted(urls_to_remove - set(removed_urls))

    return {
        "removed": removed_urls,
        "not_found": not_found,
        "remaining": len(kept_objects),
    }


def run_gui():
    root = tk.Tk()
    root.title("Links löschen")
    root.geometry("700x520")

    label = tk.Label(
        root,
        text="Issue-Text hier einfügen (Strg+V) und dann auf 'Links löschen' klicken:"
    )
    label.pack(anchor="w", padx=10, pady=(10, 0))

    text_area = scrolledtext.ScrolledText(root, wrap=tk.WORD, height=16)
    text_area.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
    text_area.focus_set()

    result_label = tk.Label(root, text="", justify="left", anchor="w")
    result_label.pack(fill=tk.X, padx=10, pady=(0, 10))

    def on_submit():
        issue_text = text_area.get("1.0", tk.END)
        urls = extract_urls(issue_text)

        if not urls:
            result_label.config(text="Keine URLs im eingefügten Text gefunden.")
            return

        print_section("LÖSCHE LINKS AUS ISSUE-TEXT")
        result = remove_links(urls)
        if result is None:
            result_label.config(text="FEHLER: script_cleaned.js konnte nicht gelesen werden.")
            return

        summary_lines = [
            f"Gelöschte Boxen: {len(result['removed'])}",
            f"Nicht gefunden: {len(result['not_found'])}",
            f"Verbleibende Boxen: {result['remaining']}",
        ]
        if result["not_found"]:
            summary_lines.append("Nicht gefunden (URL stand nicht in script_cleaned.js):")
            summary_lines.extend(f"  - {u}" for u in result["not_found"])

        result_label.config(text="\n".join(summary_lines))

        print_section("FERTIG")
        for line in summary_lines:
            print(line)

        text_area.delete("1.0", tk.END)

    button = tk.Button(root, text="Links löschen", command=on_submit)
    button.pack(pady=(0, 10))

    root.mainloop()


if __name__ == "__main__":
    run_gui()
