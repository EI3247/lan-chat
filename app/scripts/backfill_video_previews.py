#!/usr/bin/env python3
import sqlite3
from pathlib import Path
import sys

# Run inside the lan-chat container: python /app/scripts/backfill_video_previews.py
# Regenerates missing or suspiciously tiny video previews.
APP_DIR = Path(__file__).resolve().parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

import main  # noqa: E402

MIN_GOOD_PREVIEW_BYTES = 8 * 1024


def preview_is_bad(rel: str | None) -> bool:
    if not rel:
        return True
    p = main.DATA_DIR / rel
    try:
        return (not p.exists()) or p.stat().st_size < MIN_GOOD_PREVIEW_BYTES
    except Exception:
        return True


def main_backfill():
    con = sqlite3.connect(main.DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute("""
        SELECT * FROM files
        WHERE deleted=0 AND kind='video'
        ORDER BY created_at
    """).fetchall()
    targets = [r for r in rows if preview_is_bad(r['preview_path'])]
    ok = 0
    fail = 0
    skipped = len(rows) - len(targets)
    for r in targets:
        old_rel = r['preview_path']
        source = (main.DATA_DIR / r['path']).resolve()
        if not str(source).startswith(str(main.DATA_DIR.resolve())) or not source.exists():
            print(f"MISS file {r['id']} {r['original_name']} -> {source}")
            fail += 1
            continue
        rel = main.make_video_preview(source)
        if rel:
            con.execute('UPDATE files SET preview_path=? WHERE id=?', (rel, r['id']))
            con.commit()
            if old_rel and old_rel != rel:
                try:
                    old_path = main.DATA_DIR / old_rel
                    if old_path.exists():
                        old_path.unlink()
                except Exception:
                    pass
            new_path = main.DATA_DIR / rel
            print(f"OK   {r['id']} {r['original_name']} -> {rel} ({new_path.stat().st_size} bytes)")
            ok += 1
        else:
            print(f"FAIL {r['id']} {r['original_name']}")
            fail += 1
    con.close()
    print(f"done ok={ok} fail={fail} skipped={skipped} total={len(rows)} threshold={MIN_GOOD_PREVIEW_BYTES}")


if __name__ == '__main__':
    main_backfill()
