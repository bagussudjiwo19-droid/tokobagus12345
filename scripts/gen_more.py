import asyncio, os, base64, io, sys
import numpy as np
from dotenv import load_dotenv
from PIL import Image
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/mascot"
MODEL = "gemini-3.1-flash-image-preview"
GREEN = "isolated on a SOLID FLAT PURE CHROMA GREEN background color #00FF00, no shadow."

MIKO = (
    "A super cute chibi kawaii kitten mascot named Miko, cream and soft-pink fur, big sparkly "
    "round eyes, rosy blush cheeks, tiny pink bow on the ear, wearing a small pink cashier apron. "
    "Flat modern vector sticker illustration, thick clean white outline, die-cut sticker style, "
    "soft rose palette. Full body, centered. " + GREEN
)
MOMO = (
    "A super cute chibi kawaii PUPPY mascot named Momo, golden-cream fluffy fur with soft light-brown "
    "floppy ears, big friendly round eyes, tiny tongue out, cheerful and playful, wearing a small mint-teal "
    "cashier vest. Flat modern vector sticker illustration, thick clean white outline, die-cut sticker style. "
    "Full body, centered. " + GREEN
)

MIKO_MORE = {
    "thinking": "Pose: thinking, one paw on chin, a small thought bubble, curious look.",
    "calc": "Pose: holding a small calculator, focused happy expression.",
    "receipt": "Pose: proudly holding a long paper receipt.",
    "tea": "Pose: relaxing while holding a warm cup of tea, cozy smile.",
    "deepsleep": "Pose: sleeping peacefully curled up, big Zzz, eyes closed.",
    "shy": "Pose: shy and blushing, both paws near cheeks, sweet timid smile.",
    "hearts": "Pose: heart-shaped sparkling eyes, totally in love expression.",
    "dance": "Pose: dancing happily with music notes around.",
    "snack": "Pose: happily eating a small snack/cookie.",
    "bag": "Pose: carrying a cute shopping bag, cheerful.",
    "bye": "Pose: waving goodbye with a gentle smile.",
    "idea": "Pose: excited with a glowing light bulb above head, aha moment.",
    "pray": "Pose: praying with paws together, hopeful eyes, small sparkles (hoping for rezeki).",
    "promo": "Pose: holding a small sign that says SALE, excited.",
    "ok": "Pose: making an OK hand sign with paw, confident wink.",
    "cry": "Pose: happy tears of joy, touched and moved, small tear drops.",
    "pout": "Pose: cute pouting sulking face, puffed cheeks, arms crossed (playful).",
    "phone": "Pose: holding a small smartphone, cheerful.",
    "star": "Pose: holding a big golden star, sparkling proud smile.",
    "hug": "Pose: opening arms for a warm hug, loving smile.",
}

MOMO_POSES = {
    "happy": "Pose: standing happily, friendly open smile, tail wagging.",
    "wave": "Pose: waving hello with a paw, cheerful.",
    "laugh": "Pose: laughing out loud, eyes closed, very happy.",
    "tease": "Pose: playful teasing, tongue out, winking, one paw up (usil).",
    "think": "Pose: thoughtful wise look, one paw on chin, small thought bubble.",
    "love": "Pose: loving expression with a floating heart, sweet.",
    "surprised": "Pose: surprised wide eyes, paws up, small shock.",
    "money": "Pose: happily holding cash money, excited sparkly eyes.",
}


def b64_of(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def keyed(b64):
    im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    a = np.array(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 110) & (g - r > 40) & (g - b > 40)
    a[..., 3][green] = 0
    img = Image.fromarray(a.astype(np.uint8), "RGBA")
    bb = img.getbbox()
    if bb: img = img.crop(bb)
    w, h = img.size; side = max(w, h)
    cv = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    cv.paste(img, ((side - w) // 2, (side - h) // 2), img)
    cv.thumbnail((220, 220), Image.LANCZOS)
    return cv


async def gen(prompt, ref_b64=None, sess="more"):
    chat = LlmChat(api_key=API_KEY, session_id=sess, system_message="You are an expert kawaii sticker illustrator.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    if ref_b64:
        msg = UserMessage(text="Keep this EXACT same character (colors, face, outfit, sticker style) on a solid green #00FF00 background. Only change pose/expression. " + prompt, file_contents=[ImageContent(ref_b64)])
    else:
        msg = UserMessage(text=prompt)
    _, images = await chat.send_message_multimodal_response(msg)
    if not images: raise RuntimeError("no image")
    return images[0]["data"]


async def one(name, prompt, ref_b64, char):
    full = char.split("Pose:")[0] + " " + prompt if False else (char + " " + prompt)
    data = await gen(full, ref_b64)
    keyed(data).save(f"{OUT}/{name}.png", "PNG", optimize=True)
    print("OK", name, flush=True)


async def main(which):
    miko_ref = b64_of(f"{OUT}/miko_happy.png")
    if which in ("miko", "all"):
        for k, p in MIKO_MORE.items():
            try: await one(f"miko_{k}", p, miko_ref, MIKO)
            except Exception as e: print("ERR miko", k, e, flush=True)
    if which in ("momo", "all"):
        # base momo first (no ref), then rest referencing base
        try:
            data = await gen(MOMO + " " + MOMO_POSES["happy"], None, "momo")
            keyed(data).save(f"{OUT}/momo_happy.png", "PNG", optimize=True)
            print("OK momo_happy", flush=True)
        except Exception as e:
            print("ERR momo base", e, flush=True); return
        momo_ref = b64_of(f"{OUT}/momo_happy.png")
        for k, p in MOMO_POSES.items():
            if k == "happy": continue
            try: await one(f"momo_{k}", p, momo_ref, MOMO)
            except Exception as e: print("ERR momo", k, e, flush=True)
    print("DONE", which, flush=True)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "all"))
