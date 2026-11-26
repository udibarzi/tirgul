#!/usr/bin/env python3
"""
Generate English recordings for every vocab word/phrase -> audio/en/{slug}.mp3

Uses the local Kokoro TTS model (installed by the explain skill). Run with its venv:

    ~/.cache/explain-skill/venv/bin/python -I _build_audio.py            # only missing files
    ~/.cache/explain-skill/venv/bin/python -I _build_audio.py --force    # regenerate all

Existing files are skipped, so after adding a word list just run it again.
Needs ffmpeg (brew install ffmpeg) to encode MP3.
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "audio", "en")
MODEL_DIR = os.environ.get("KOKORO_DIR", os.path.expanduser("~/.cache/explain-skill/models/kokoro"))
VOICE = os.environ.get("KOKORO_VOICE", "af_heart")   # clear American female voice
SPEED = 0.9                                          # a little slower for learners


def vocab_slug(en):
    """MUST match vocabSlug() in app/vocab.js."""
    s = en.lower()
    s = re.sub(r"[’']", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:60]


def collect_texts():
    texts = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "content", "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("words", []) + data.get("sentences", [])
        for lv in (data.get("levels") or {}).values():   # ladder-placement.json
            items += lv.get("words", []) + lv.get("sentences", [])
        for w in items:
            slug = vocab_slug(w["en"])
            if slug in texts and texts[slug].lower().rstrip("!?.") != w["en"].lower().rstrip("!?."):
                print(f"WARNING: '{w['en']}' and '{texts[slug]}' share audio file {slug}.mp3")
            texts.setdefault(slug, w["en"])
    return texts


def main():
    force = "--force" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    texts = collect_texts()
    todo = {s: t for s, t in texts.items() if force or not os.path.exists(os.path.join(OUT, s + ".mp3"))}
    print(f"{len(texts)} words/phrases, {len(todo)} to generate")
    if not todo:
        return

    import soundfile as sf
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(os.path.join(MODEL_DIR, "kokoro-v1.0.int8.onnx"), os.path.join(MODEL_DIR, "voices-v1.0.bin"))

    with tempfile.TemporaryDirectory() as tmp:
        for i, (slug, text) in enumerate(sorted(todo.items()), 1):
            samples, sr = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
            wav = os.path.join(tmp, slug + ".wav")
            sf.write(wav, samples, sr)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-b:a", "48k",
                            os.path.join(OUT, slug + ".mp3")], check=True)
            print(f"  [{i}/{len(todo)}] {slug}.mp3  ← {text}")


if __name__ == "__main__":
    main()
