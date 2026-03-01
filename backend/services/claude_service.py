"""Caption generation via Google Gemini (free) or Anthropic Claude (fallback)."""

import base64
import os


def generate_caption(
    images: list[tuple[bytes, str]],
    tone: str = "engaging",
    date_str=None,
    location_str=None,
) -> str:
    """
    Send one or more images to Gemini Flash and return a suggested Instagram caption.
    Falls back to Claude Sonnet if GEMINI_API_KEY is not set.
    Optionally accepts date_str and location_str from photo EXIF to enrich the caption.
    """
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if gemini_key and gemini_key != "your-gemini-api-key-here":
        caption = _generate_with_gemini(images, tone, gemini_key, location_str)
    else:
        caption = _generate_with_claude(images, tone, location_str)

    if date_str:
        body, hashtags = _split_hashtags(caption)
        caption = f"{body}\n\n📅 {date_str}\n\n{hashtags}" if hashtags else f"{body}\n\n📅 {date_str}"

    return caption


def _split_hashtags(caption: str):
    """
    Split a caption into (body, hashtag_block).
    Walks backwards through lines to find the trailing hashtag block.
    """
    lines = caption.rstrip().split("\n")
    split_at = len(lines)
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i].strip()
        if not line:
            continue
        if all(w.startswith("#") for w in line.split()):
            split_at = i
        else:
            break
    body = "\n".join(lines[:split_at]).rstrip()
    hashtags = "\n".join(lines[split_at:]).strip()
    return body, hashtags


# ── Prompt (shared) ──────────────────────────────────────────────────────────

def _caption_prompt(num_images: int, tone: str, location_str=None) -> str:
    context = f"a carousel of {num_images} photos" if num_images > 1 else "this photo"

    meta_context = ""
    if location_str:
        meta_context = f"\n\nThe location is {location_str}. Weave this into the caption naturally if it fits."

    return (
        f"You are a real person posting {context} to your personal Instagram. "
        f"Write a {tone} caption for it.{meta_context}\n\n"
        "Rules you must follow:\n"
        "- Write like a human, not a content marketer. Casual, conversational language — "
        "contractions, short sentences, fragments are fine.\n"
        "- Write in first person when it fits naturally.\n"
        "- Reference the feeling or moment behind the photo, not just what's visible.\n"
        "- Never open with 'Embracing', 'Capturing', 'Celebrating', or similar AI-tell openers.\n"
        "- Avoid overused words: vibrant, stunning, breathtaking, magical, journey, adventure.\n"
        "- Do not use em-dashes (—) as a stylistic device.\n"
        "- No calls-to-action like 'Tag a friend' or 'Let me know in the comments'.\n"
        "- End with 5 to 8 hashtags on a single line. Mix broad high-volume tags (#photography, #nature) "
        "with specific niche tags (#coloradowinter, #sonyalpha) to maximise reach and discovery. "
        "All lowercase, directly relevant to the photo's subject, location, and mood.\n"
        "- Keep the caption body under 150 words (hashtags don't count).\n\n"
        "Return ONLY the caption text — no extra commentary."
    )


# ── Gemini ────────────────────────────────────────────────────────────────────

def _generate_with_gemini(
    images: list[tuple[bytes, str]], tone: str, api_key: str, location_str=None
) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    parts = []
    for image_bytes, mime_type in images:
        parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
    parts.append(_caption_prompt(len(images), tone, location_str))

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=parts,
    )
    return response.text.strip()


# ── Claude fallback ───────────────────────────────────────────────────────────

def _generate_with_claude(images: list[tuple[bytes, str]], tone: str, location_str=None) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    content = []
    for image_bytes, mime_type in images:
        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": mime_type, "data": b64},
        })
    content.append({"type": "text", "text": _caption_prompt(len(images), tone, location_str)})

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": content}],
    )
    return message.content[0].text.strip()
