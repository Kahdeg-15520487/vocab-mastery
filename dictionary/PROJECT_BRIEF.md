# Vocabulary Learning Web App — Project Brief

## Goal

Build a web application for learning English vocabulary using the Oxford 3000/5000 word lists. The app should let users browse, search, quiz themselves on words, and listen to pronunciation audio (UK & US accents).

---

## Available Data & Resources

### 1. Word Metadata — `data/oxford_5000.json`

This is the **primary data file** — a JSON object keyed by numeric index (`"0"`, `"1"`, ...). It contains **5,944 entries** with all the word metadata you need.

**Schema (per entry):**

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `word` | string | `"abandon"` | The vocabulary word |
| `type` | string | `"verb"` | Part of speech |
| `cefr` | string | `"b2"` | CEFR proficiency level (a1, a2, b1, b2, c1) |
| `phon_br` | string | `"/əˈbændən/"` | British IPA phonetic transcription |
| `phon_n_am` | string | `"/əˈbændən/"` | American IPA phonetic transcription |
| `definition` | string | `"to leave somebody..."` | Word definition |
| `example` | string | `"The baby had been..."` | Usage example sentence |
| `uk` | string | `"abandon_uk.mp3"` | UK pronunciation audio filename |
| `us` | string | `"abandon_us.mp3"` | US pronunciation audio filename |

**Sample entry:**
```json
{
  "word": "abandon",
  "type": "verb",
  "cefr": "b2",
  "phon_br": "/əˈbændən/",
  "phon_n_am": "/əˈbændən/",
  "definition": "to leave somebody, especially somebody you are responsible for, with no intention of returning",
  "example": "abandon somebody, The baby had been abandoned by its mother.",
  "uk": "abandon_uk.mp3",
  "us": "abandon_us.mp3"
}
```

### 2. Audio Files

Located in two directories (currently extracted from split ZIP archives):

| Directory | Contents | Count |
|-----------|----------|-------|
| `audio/uk_audio_split_24m/` | `*_uk.mp3` files | 4,953 |
| `audio/us_audio_split_24m/` | `*_us.mp3` files | 4,953 |

**Naming convention:** `{word}_uk.mp3` and `{word}_us.mp3` — this matches the `uk` and `us` fields in the JSON exactly.

**Archived copies** (split ZIP, ~92MB per accent, ~184MB total):
- `audio/uk_audio_split_24m.zip` + `.z01`, `.z02`, `.z03`
- `audio/us_audio_split_24m.zip` + `.z01`, `.z02`, `.z03`

To rejoin: `zip -s 0 uk_audio_split_24m.zip --out uk_audio.zip` then unzip.

### 3. Other Data Files in `data/`

| File | Format | Rows | Notes |
|------|--------|------|-------|
| `oxford_3000.json` / `.csv` / `.pkl` | same schema | 3,805 | Subset — the 3,000 most common words |
| `oxford_5000.json` / `.csv` / `.pkl` | same schema | 5,944 | Full set — **use this as the primary source** |
| `oxford_5000_exclusive.json` / `.csv` / `.pkl` | same schema | 2,138 | Words in the 5000 but NOT in the 3000 |
| `df.pkl` | diff schema | 5,943 | Raw scraped data with Oxford URL paths for audio |
| `df_definition.pkl` | diff schema | 5,943 | Definitions joined from tusharlock10 dictionary |
| `df_concat.pkl` | diff schema | 5,944 | Merged version of the above two |

> **Stick with `oxford_5000.json`** — it's the cleanest, most complete version with all fields needed.

---

## Data Statistics

### CEFR Level Distribution

| Level | Count | Description |
|-------|-------|-------------|
| A1 | 1,076 | Beginner |
| A2 | 990 | Elementary |
| B1 | 902 | Intermediate |
| B2 | 1,571 | Upper intermediate |
| C1 | 1,404 | Advanced |

### Part of Speech Distribution (Top 10)

| Type | Count |
|------|-------|
| noun | 2,958 |
| verb | 1,247 |
| adjective | 1,076 |
| adverb | 366 |
| pronoun | 77 |
| preposition | 66 |
| determiner | 42 |
| number | 33 |
| conjunction | 32 |
| exclamation | 20 |

### Audio Coverage

- **5,942 out of 5,944 words** have both UK and US audio (99.97% coverage)
- Only 2 entries are missing audio:
  - `nursing` (noun, b2) — no audio files found
  - 1 entry appears to be a blank/invalid row (empty word, empty type)

---

## Suggested Database Schema

```sql
CREATE TABLE words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT    NOT NULL,
    type        TEXT    NOT NULL,       -- part of speech
    cefr        TEXT    NOT NULL,       -- a1, a2, b1, b2, c1
    phon_br     TEXT,                   -- British IPA
    phon_n_am   TEXT,                   -- American IPA
    definition  TEXT    NOT NULL,
    example     TEXT,
    uk_audio    TEXT,                   -- filename e.g. "abandon_uk.mp3"
    us_audio    TEXT,                   -- filename e.g. "abandon_us.mp3"
    has_audio   BOOLEAN DEFAULT 1       -- false for the ~2 missing entries
);
```

**Loading script** (Python + SQLite):

```python
import json, sqlite3, os

with open('data/oxford_5000.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

conn = sqlite3.connect('vocabulary.db')
conn.execute('''CREATE TABLE words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    type TEXT NOT NULL,
    cefr TEXT NOT NULL,
    phon_br TEXT,
    phon_n_am TEXT,
    definition TEXT NOT NULL,
    example TEXT,
    uk_audio TEXT,
    us_audio TEXT,
    has_audio BOOLEAN DEFAULT 1
)''')

for i, row in data.items():
    word = row.get('word', '').strip()
    if not word:  # skip blank rows
        continue
    uk = row.get('uk', '')
    us = row.get('us', '')
    has_audio = os.path.exists(f'audio/uk_audio_split_24m/{uk}') and \
                os.path.exists(f'audio/us_audio_split_24m/{us}')
    conn.execute(
        'INSERT INTO words (word, type, cefr, phon_br, phon_n_am, definition, example, uk_audio, us_audio, has_audio) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (word, row['type'], row['cefr'], row['phon_br'], row['phon_n_am'],
         row['definition'], row['example'], uk, us, has_audio)
    )

conn.commit()
conn.close()
print('Done. vocabulary.db created.')
```

---

## Suggested Web App Features

### Core
1. **Browse & search** words with filtering by CEFR level, part of speech, alphabetical order
2. **Word detail card** showing: word, phonetics, definition, example, play UK/US audio
3. **Audio playback** — serve MP3 files, with a play button for each accent

### Learning
4. **Flashcard mode** — show word, reveal definition on click/tap
5. **Quiz mode** — multiple choice: given a word, pick the correct definition (or vice versa)
6. **Spaced repetition** — track which words the user knows vs. needs to review
7. **CEFR-based learning paths** — start with A1 words, progress through levels

### Nice to Have
8. **User progress tracking** — per-word familiarity score, session history
9. **Favorites/bookmarks** — save words for later review
10. **Offline support** — PWA or service worker for audio caching
11. **Dark mode**

---

## Files to Copy to the New Project

```
data/oxford_5000.json          ← primary word data (copy this)
audio/uk_audio_split_24m/      ← UK audio files (~88MB)
audio/us_audio_split_24m/      ← US audio files (~88MB)
```

Optionally also copy `data/oxford_3000.json` and `data/oxford_5000_exclusive.json` if you want pre-filtered subsets.

---

## Tech Stack Suggestions

- **Backend:** Node.js/Express or Python/FastAPI — simple CRUD + static audio serving
- **Database:** SQLite (embedded, zero config) or PostgreSQL if you want user accounts
- **Frontend:** React/Vue/Svelte with TailwindCSS, or a full-stack framework like Next.js
- **Audio:** Serve MP3s as static files, play with HTML5 `<audio>` element

---

## Notes

- The JSON file is ~1.4MB, the audio is ~176MB total. For a web app, consider compressing the MP3s or using a CDN.
- All definitions are in English (monolingual). This is aimed at intermediate+ learners who can read English definitions.
- The `cefr` field is perfect for creating progressive difficulty levels in the app.
- Audio filenames use the word as the prefix (e.g., `abandon_uk.mp3`), so you can derive filenames from the word if needed. But the JSON already provides the exact filenames — use those.
