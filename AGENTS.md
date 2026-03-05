# AutoInstaPost — Agent Instructions

Rules the AI must follow when generating captions and selecting photos for Instagram posts.

---

## 1. Never Reuse Photos

- Before selecting a photo, check the posting history and skip any photo that has already been posted.
- If all photos in the folder have been used, pause scheduling and alert the user rather than reposting.

## 2. Captions Must Sound Human, Not AI

The goal is for captions to read like something a real person dashed off — not a polished marketing copy or a listicle from a content bot.

**Do:**
- Write in first person plural ("we", "our", "us") — this account belongs to a couple, never use "I" or "my"
- Use casual, conversational language — contractions, short sentences, even sentence fragments
- Include small imperfections: a rhetorical question, a trailing thought, mild humor
- Reference the moment or feeling behind the photo, not just what's visible
- Keep hashtags relevant and lowercase — 3 to 6 max, tucked at the end
- Vary sentence length; avoid rhythm that sounds like it was generated

**Don't:**
- Start with "Embracing", "Capturing", "Celebrating", or similar AI-tell openers
- Use em-dashes (—) as a stylistic crutch
- Write more than 3 sentences of pure description
- Use words like "vibrant", "stunning", "breathtaking", "magical", "journey", "adventure" unless the photo genuinely calls for it
- End with a call-to-action ("Let me know in the comments!", "Tag a friend who…")
- Stack more than 6 hashtags
- Use "I" or "my" — always write as "we", "our", or "us"
- Use time-relative words like "today", "this week", "yesterday", "last weekend" — the photo date comes from EXIF and may be months or years old; keep all time references generic (e.g. "one afternoon", "a while back", "that time in…")

## 3. Always Pick at Least 3 Photos — Maximum 4

- Each scheduled post must include a minimum of 3 photos and a maximum of 4 photos, posted as a carousel.
- If fewer than 3 unposted photos remain in the folder, use however many are available rather than skipping the post entirely.
- Never post a single photo from the scheduler — the experience should always feel like a curated set.
- Never include more than 4 photos in a single carousel post.

## 4. Always Include the Photo Date

- Extract the date from the photo's EXIF metadata (DateTimeOriginal → DateTimeDigitized → DateTime, in priority order).
- Append the date to the caption in the format `📅 DD Month YYYY` (e.g. `📅 26 January 2026`).
- The date must appear **after** the caption body and **before** the hashtags.
- If no EXIF date is found, omit the date line entirely — do not guess or fabricate a date.

## 6. Group Photos by Location — Never Mix Locations in One Post

- Before selecting photos for a scheduled post, resolve the GPS location of every unposted photo using EXIF metadata (partial 128 KB download + persistent cache to avoid re-fetching).
- Group photos by location name. Select **all photos from the location with the most unposted shots** for the post (up to a maximum of 4 per post).
- Never mix photos taken at clearly different locations in a single post.
- If no photo has GPS data, or no location group has ≥ 2 photos, fall back to random selection so the scheduler always makes progress.
- Cache resolved locations in `data/photo_locations.json` (keyed by Drive file ID) so each photo is only scanned for GPS once.

## 5. Hashtags Must Maximise Reach

- Every post must include 5 to 8 hashtags, placed as the last element after the `📅` date line.
- Mix **broad high-volume tags** (e.g. `#photography`, `#nature`, `#travel`) with **specific niche tags** (e.g. `#coloradowinter`, `#sonyalpha`, `#snowymountains`) to balance discovery and relevance.
- All hashtags must be lowercase and directly relevant to the photo's subject, location, and mood.
- Never use generic filler tags like `#instagood`, `#photooftheday`, or `#like4like`.
