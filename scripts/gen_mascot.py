import asyncio, os, base64, io
from dotenv import load_dotenv
from PIL import Image
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
OUT = "/app/frontend/assets/mascot"
os.makedirs(OUT, exist_ok=True)

MODEL = "gemini-3.1-flash-image-preview"

CHAR = (
    "A super cute chibi kawaii kitten mascot named Miko, cream and soft-pink fur, "
    "big sparkly round eyes, rosy blush cheeks, tiny pink bow on the ear, wearing a "
    "small cashier apron. Flat modern vector sticker illustration, thick clean outline, "
    "die-cut sticker style, soft rose color palette (#FF758F pink, #CDB4DB lilac), "
    "fully isolated on a transparent background, no shadow, no text, centered, full body."
)

POSES = {
    "happy":     f"{CHAR} Pose: standing happily, smiling warmly, one paw waving hello.",
    "wave":      f"{CHAR} Pose: excited, both paws up celebrating, big joyful open smile, tiny sparkles around.",
    "surprised": f"{CHAR} Pose: surprised and worried, wide shocked eyes, one paw on cheek, small sweat drop.",
    "love":      f"{CHAR} Pose: blowing a kiss with a floating heart, eyes closed happily, very sweet and thankful.",
}


def save_png(b64: str, path: str):
    raw = base64.b64decode(b64)
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    # downscale to keep bundle small (max 512px)
    img.thumbnail((512, 512), Image.LANCZOS)
    img.save(path, "PNG")
    print("saved", path, img.size)


async def gen(prompt: str, ref_b64: str | None = None):
    chat = LlmChat(api_key=API_KEY, session_id="miko-mascot", system_message="You are an expert kawaii sticker illustrator.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    if ref_b64:
        msg = UserMessage(text=prompt, file_contents=[ImageContent(ref_b64)])
    else:
        msg = UserMessage(text=prompt)
    _, images = await chat.send_message_multimodal_response(msg)
    if not images:
        raise RuntimeError("no image returned")
    return images[0]["data"]


async def main():
    # 1) base happy pose
    base = await gen(POSES["happy"])
    save_png(base, f"{OUT}/miko_happy.png")
    # 2) others use base as reference for character consistency
    for key in ["wave", "surprised", "love"]:
        edit_prompt = (
            "Keep this EXACT same kitten mascot character (same colors, same face, same apron, "
            "same sticker style, transparent background). Only change the pose/expression. "
            + POSES[key]
        )
        data = await gen(edit_prompt, ref_b64=base)
        save_png(data, f"{OUT}/miko_{key}.png")


if __name__ == "__main__":
    asyncio.run(main())
