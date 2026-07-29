# Easy Android XML Translator

A lightweight, free, **no-account** web tool that lets human contributors translate Android `strings.xml` files for you. A developer pastes their source URL, picks a target language, and gets a single shareable link that opens a translator view directly in the browser. All work happens client-side, so there is no backend to run.

> No AI is involved in translations — humans translate humans' apps, which is usually a higher-quality and more motivating experience for contributors.

---

## Features

- **One-link workflow** — generate a translator URL in seconds, no configuration or sign-up required.
- **Works against any GitHub repo** — paste a raw `strings.xml` URL and the tool guesses the correct target path.
- **Translation memory** — translations you've already done for other languages are auto-reused as a starting point for new languages.
- **Smart validation** — catches placeholder mismatches (`%1$s`), `<xliff:g>` tags, outdated source strings, and translations that are identical to the source.
- **Right-to-left aware** — Arabic, Hebrew, Persian and Urdu flip the entire UI automatically.
- **Native language names** — translators see their language in their own script (Français, العربية, 日本語, …).
- **Mobile-friendly** — swipe through translations one card at a time on a phone.
- **Offline-capable** — progress is persisted in `localStorage`; you can also upload a local `strings.xml` file directly.

---

## Quick start

1. Open the hosted site (or run locally — see below).
2. Click the **Generate URL** tab.
3. Paste the **raw GitHub URL** of your `values/strings.xml` file. (Open the file on GitHub → click *Raw* → copy the URL from the address bar.)
4. Pick the **target language** from the grid.
5. Click **Generate URL**, then **Copy URL** and send the link to your translators.

When a translator opens the link, the strings load in their browser and they can start typing. When done, they click **Download XML** and send the file back to you.

---

## Running locally

The project is a static site — no build step is required.

```bash
# Clone
git clone https://github.com/Luminus-Labs/Easy-Android-xml-translator.git
cd Easy-Android-xml-translator

# Option A: open directly
open index.html    # macOS
xdg-open index.html  # Linux
start index.html     # Windows

# Option B: serve over HTTP (recommended)
python -m http.server 8080
# then visit http://localhost:8080
```

---

## Project structure

```
.
├── index.html          # Single page entry; mounts all three modes
├── langs.js            # Unified language schema (single source of truth)
├── generator.js        # Link Generator mode
├── translator.js       # Translator mode (rendering, parsing, exporting)
├── main.js             # Mode router (generator / translator / about)
├── theme.js            # Light/dark theme toggle
├── style.css           # Theme tokens + RTL rules
└── tailwind.js         # Bundled Tailwind runtime
```

---

## How it works

```
Developer                            Translator
─────────                            ──────────
1. Paste raw strings.xml URL
2. Choose target language
3. Get a link  ─────────────────▶   4. Open link in browser
                                     5. Fetch base XML via CORS proxy
                                     6. Type translations (autosaved)
                                     7. Click "Download XML"  ─────▶  8. Drop file into repo
```

All state lives in the translator's `localStorage`. The developer never sees the in-progress translations until the translator hands them back the file (or opens an issue / sends the file via email, whichever workflow you prefer).

---

## Supported string types

| Type         | Editable? | Notes                                              |
|--------------|-----------|----------------------------------------------------|
| `<string>`   | yes       | Plain strings, preserves `translatable` & `formatted` attributes |
| `<plurals>`  | yes       | Per-quantity inputs (`zero`, `one`, `few`, …, `other`) |
| `<string-array>` | yes   | Items joined by ` | ` in the editor                |

---

## Supported languages

The default set shipped in `langs.js` covers 36 languages (en, fr, es, de, it, pt, ja, zh, ru, ar, he, fa, ur, ko, nl, tr, pl, hi, id, vi, th, uk, cs, sv, el, ro, hu, fi, da, no, bg, bn, ta, ms, ca, sw) — including all four RTL scripts.

Adding a new language is a single line in `langs.js`; the generator dropdown and the translator UI pick it up automatically.

---

## License

See [LICENSE](./LICENSE).
