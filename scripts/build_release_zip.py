"""Package the distributable EXE + runtime into a clean ZIP for GitHub Releases.

Excludes privacy-sensitive data: keys (keys.json / keys.enc), Minebot agent
state (bots/, histories/), and junk files.  Only the two EXEs + the runtime
folder (node.exe + mindcraft) are included.
"""
import os
import zipfile

DIST = os.path.join(os.path.dirname(__file__), "..", "backend", "dist")
OUT = os.path.join(DIST, "AIEnglishStudio-v3.0.0.zip")

EXES = ["AIEnglishStudio.exe", "AIEnglishStudio_zh.exe"]

EXCLUDE_PREFIXES = (
    "runtime/mindcraft/bots/",
    "runtime/mindcraft/histories/",
)
EXCLUDE_NAMES = {"keys.json", "keys.enc"}


def should_exclude(relpath: str) -> bool:
    relpath = relpath.replace("\\", "/")
    if "C:UsersHP" in relpath:
        return True
    for p in EXCLUDE_PREFIXES:
        if relpath.startswith(p):
            return True
    if os.path.basename(relpath) in EXCLUDE_NAMES:
        return True
    return False


def main():
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for exe in EXES:
            p = os.path.join(DIST, exe)
            if os.path.exists(p):
                zf.write(p, exe)
                count += 1
        runtime_root = os.path.join(DIST, "runtime")
        for root, _dirs, files in os.walk(runtime_root):
            for f in files:
                fp = os.path.join(root, f)
                rel = os.path.relpath(fp, DIST)
                if should_exclude(rel):
                    continue
                zf.write(fp, rel)
                count += 1
    size_mb = os.path.getsize(OUT) / (1024 * 1024)
    print(f"packaged {count} files -> {OUT} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
