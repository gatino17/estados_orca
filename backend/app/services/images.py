from PIL import Image
import io


def to_webp_bytes(raw: bytes, max_size: int = 1920, quality: int = 82) -> tuple[bytes, str, int | None, int | None, int]:
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((max_size, max_size))
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=quality)
        webp = out.getvalue()
        w, h = img.size
        return webp, "image/webp", w, h, len(webp)
    except Exception:
    # fallback: devuelve original
     return raw, "application/octet-stream", None, None, len(raw)