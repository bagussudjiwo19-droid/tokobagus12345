import asyncio, os, base64, io
import numpy as np
from dotenv import load_dotenv
from PIL import Image
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/mascot"
MODEL = "gemini-3.1-flash-image-preview"

CHAR = (
    "A super cute chibi kawaii kitten mascot named Miko, cream and soft-pink fur, "
    "big sparkly round eyes, rosy blush cheeks, tiny pink bow on the ear, wearing a "
    "small cashier apron. Flat modern vector sticker illustration, thick clean white outline, "
    "die-cut sticker style, soft rose palette. Full body, centered, "
    "isolated on a SOLID FLAT PURE CHROMA GREEN background color #00FF00, no shadow."
)

NEW_POSES = {
    "wink":     f"{CHAR} Pose: playful wink with one eye closed, cheerful open smile, one paw making a peace/V sign.",
    "money":    f"{CHAR} Pose: happily holding a small stack of cash money with sparkly excited eyes, big joyful smile.",
    "sleepy":   f"{CHAR} Pose: sleepy and cozy, gentle yawn, one paw rubbing an eye, small floating Zzz.",
    "thumbsup": f"{CHAR} Pose: confident happy expression giving a big thumbs up with its paw, cheerful wink.",
}

with open(f"{OUT}/miko_happy.png", "rb") as f:
    REF = base64.b64encode(f.read()).decode("utf-8")


def keyed_square(b64: str) -> Image.Image:
    im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    a = np.array(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # buang hijau: hijau dominan dibanding merah & biru
    green = (g > 110) & (g - r > 40) & (g - b > 40)
    a[..., 3][green] = 0
    img = Image.fromarray(a.astype(np.uint8), "RGBA")
    bbox = img.getbbox()
    if bbox: img = img.crop(bbox)
    w, h = img.size; side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    canvas.thumbnail((512, 512), Image.LANCZOS)
    return canvas


async def gen(prompt: str) -> str:
    chat = LlmChat(api_key=API_KEY, session_id="miko-mascot-3", system_message="You are an expert kawaii sticker illustrator.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    msg = UserMessage(
        text="Keep this EXACT same kitten mascot character (same colors, face, apron, sticker style). Only change the pose/expression and use a solid pure green #00FF00 background. " + prompt,
        file_contents=[ImageContent(REF)],
    )
    _, images = await chat.send_message_multimodal_response(msg)
    if not images: raise RuntimeError("no image")
    return images[0]["data"]


async def main():
    for name, prompt in NEW_POSES.items():
        data = await gen(prompt)
        img = keyed_square(data)
        img.save(f"{OUT}/miko_{name}.png", "PNG")
        px = img.load()
        print("saved", name, img.size, "corner alpha", px[0, 0][3], "filebytes~")


if __name__ == "__main__":
    asyncio.run(main())
