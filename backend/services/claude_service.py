"""Caption generation via Anthropic Claude (vision)."""

import base64
import os

import anthropic

_client: anthropic.Anthropic | None = None


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
        f"You are an Instagram content creator. Look at this photo and write a {tone} "
        "Instagram caption for it. Include 5-10 relevant hashtags at the end. "
        "Keep the caption under 200 words. Return ONLY the caption text — no extra commentary."
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
