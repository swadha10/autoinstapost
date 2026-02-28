"""Caption generation via Anthropic Claude (vision)."""

import base64
import os
from typing import Optional

import anthropic

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


def generate_caption(image_bytes: bytes, mime_type: str, tone: str = "engaging") -> str:
    """
    Send the image to Claude and return a suggested Instagram caption.

    *tone* can be "engaging", "professional", "funny", "inspirational", etc.
    """
    client = _get_client()
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = (
        f"You are a real person posting to your personal Instagram. Look at this photo and write a {tone} caption for it.\n\n"
        "Rules you must follow:\n"
        "- Write like a human, not a content marketer. Use casual, conversational language — contractions, short sentences, fragments are fine.\n"
        "- Write in first person when it fits naturally.\n"
        "- Reference the feeling or moment behind the photo, not just what's visible.\n"
        "- Never open with 'Embracing', 'Capturing', 'Celebrating', or similar AI-tell openers.\n"
        "- Avoid overused words: vibrant, stunning, breathtaking, magical, journey, adventure.\n"
        "- Do not use em-dashes (—) as a stylistic device.\n"
        "- No calls-to-action like 'Tag a friend' or 'Let me know in the comments'.\n"
        "- End with 3 to 6 relevant lowercase hashtags only — no more.\n"
        "- Keep the whole caption under 150 words.\n\n"
        "Return ONLY the caption text — no extra commentary."
    )

    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    return message.content[0].text.strip()
