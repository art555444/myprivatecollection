"""Liest offene GitHub-Issues mit dem Label 'loeschanfrage' (von der Website
gemeldete Löschwünsche), entfernt die passenden Boxen aus script_cleaned.js,
löscht die zugehörigen Thumbnails, schließt die Issues und committet/pusht
die Änderungen automatisch (Account-Switch zu art555444 und zurück
inklusive)."""

import json
import re
import subprocess

from link_common import (
    print_section,
    clear_existing_thumb_files,
    get_field,
    load_video_objects,
    save_video_objects,
)

REPO = "art555444/myprivatecollection"
LABEL = "loeschanfrage"
GH_ACCOUNT = "art555444"
GH_ACCOUNT_BACK = "artesyjany"


def run_gh(args):
    result = subprocess.run(["gh"] + args, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"FEHLER bei 'gh {' '.join(args)}': {result.stderr.strip()}")
        return None
    return result.stdout


def fetch_open_issues():
    out = run_gh([
        "issue", "list",
        "--repo", REPO,
        "--label", LABEL,
        "--state", "open",
        "--json", "number,title,body",
    ])
    if out is None:
        return []
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        print("FEHLER: Konnte gh-Ausgabe nicht als JSON lesen.")
        return []


def extract_ids(body):
    return sorted(set(re.findall(r"custom-\d+", body or "")))


def close_issue(number, removed, missing):
    lines = []
    if removed:
        lines.append(f"Entfernt: {', '.join(removed)}")
    if missing:
        lines.append(f"Nicht (mehr) gefunden: {', '.join(missing)}")
    comment = "\n".join(lines) if lines else "Keine passenden Boxen gefunden."
    run_gh(["issue", "close", str(number), "--repo", REPO, "--comment", comment])


def switch_gh_account(user):
    run_gh(["auth", "switch", "--hostname", "github.com", "--user", user])


def commit_and_push(removed, missing):
    subprocess.run(["git", "add", "-A"], check=True)
    status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
    if not status.stdout.strip():
        print("Keine Dateiänderungen — nichts zu committen.")
        return

    lines = ["Löschanfragen bearbeitet"]
    if removed:
        lines.append(f"Entfernt: {', '.join(removed)}")
    if missing:
        lines.append(f"Nicht (mehr) gefunden: {', '.join(missing)}")
    message = "\n\n".join(lines)

    subprocess.run(["git", "commit", "-m", message], check=True)
    subprocess.run(["git", "push"], check=True)
    print("Committet und gepusht.")


def main():
    switch_gh_account(GH_ACCOUNT)
    try:
        print_section("OFFENE LÖSCHANFRAGEN")
        issues = fetch_open_issues()
        if not issues:
            print("Keine offenen Issues mit Label 'loeschanfrage' gefunden.")
            return

        objects, content, start, end = load_video_objects()
        if objects is None:
            return

        total_removed = []
        total_missing = []

        for issue in issues:
            number = issue["number"]
            ids = extract_ids(issue.get("body", ""))
            print(f"\nIssue #{number} ({issue.get('title', '')}): {len(ids)} ID(s)")

            removed_here = []
            missing_here = []
            for vid in ids:
                match_idx = None
                for i, obj in enumerate(objects):
                    if get_field(obj, "id") == vid:
                        match_idx = i
                        break
                if match_idx is None:
                    print(f"  {vid}: nicht (mehr) gefunden -> übersprungen")
                    missing_here.append(vid)
                    continue
                objects.pop(match_idx)
                clear_existing_thumb_files(vid)
                print(f"  {vid}: entfernt")
                removed_here.append(vid)

            close_issue(number, removed_here, missing_here)
            total_removed.extend(removed_here)
            total_missing.extend(missing_here)

        save_video_objects(objects, content, start, end)

        print_section("FERTIG")
        print(f"Entfernte Boxen: {len(total_removed)}")
        print(f"Nicht gefundene IDs: {len(total_missing)}")
        print(f"Verbleibende Boxen gesamt: {len(objects)}")
        print()

        print_section("GIT")
        commit_and_push(total_removed, total_missing)
    finally:
        switch_gh_account(GH_ACCOUNT_BACK)


if __name__ == "__main__":
    main()
