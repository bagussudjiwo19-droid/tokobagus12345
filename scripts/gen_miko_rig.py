import asyncio
import os
import sys
import base64
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv("/app/backend/.env")
API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"

MASCOT = "/app/frontend/assets/mascot/miko_happy.png"
OUT = "/app/frontend/assets/miko_rig"
BASE = os.path.join(OUT, "base.png")
os.makedirs(OUT, exist_ok=True)

IDENTITY = (
    "This exact cute chibi kawaii cat mascot named Miko: cream/white fluffy body, "
    "pink inner ears, a PINK RIBBON BOW on the LEFT ear, big round dark eyes with white "
    "sparkle highlights, rosy pink blush cheeks, wearing a salmon-pink apron overall dress "
    "with a small white flower on the chest and a lilac/purple short-sleeve shirt underneath, "
    "fluffy tail with pink tip. Soft rounded dark outlines, flat pastel cartoon sticker style. "
    "KEEP the character IDENTITY, colors, outfit, bow, outline and proportions EXACTLY like the reference."
)
BG = ("Plain solid WHITE background. Full body, centered, head-to-toe inside frame with margin. "
      "No shadow, no ground line, no text. Square, high resolution, crisp edges.")

# frames that MUST stay pixel-aligned to base (for blink & mouth flap cross-fade)
ALIGN = ("VERY IMPORTANT: keep the WHOLE image pixel-identical to the reference - do NOT move or "
         "redraw the body, arms, dress, tail, head position or size. Change ONLY the described part. ")

FRAMES = {
    # --- alignment-critical (edit base) ---
    "blink":     ALIGN + "Close BOTH eyes into gentle happy downward-curved arcs (blinking). Keep the closed-mouth smile.",
    "talk_mid":  ALIGN + "Open the mouth a little into a small soft oval (mid-talking). Keep eyes open.",
    "talk_open": ALIGN + "Open the mouth wide into a rounded talking shape showing a happy expression (talking). Keep eyes open.",
    # --- expressions (pose may change, keep identity) ---
    "happy":     "Redraw " + IDENTITY + " Expression: big cheerful OPEN-mouth smile, sparkling happy eyes, both arms relaxed. " + BG,
    "laugh":     "Redraw " + IDENTITY + " Expression: laughing joyfully, eyes closed into happy arcs, mouth wide open laughing, head tilted slightly back, one paw near mouth. " + BG,
    "thinking":  "Redraw " + IDENTITY + " Pose: thinking - one paw raised to the chin, eyes looking up to the side, closed thoughtful mouth, slight head tilt. " + BG,
    "confused":  "Redraw " + IDENTITY + " Expression: confused/puzzled - head tilted to one side, one raised eyebrow, small wavy uncertain mouth, one paw scratching head. " + BG,
    "sad":       "Redraw " + IDENTITY + " Expression: sad - droopy teary eyes, small frown, ears drooping down a bit, paws held together low. " + BG,
    "surprised": "Redraw " + IDENTITY + " Expression: surprised - very wide big eyes, small round open 'o' mouth, paws up near cheeks, leaning back a little. " + BG,
    "point":     "Redraw " + IDENTITY + " Pose: happily POINTING to the side with the right paw/arm extended toward something, cheerful open smile, looking that direction. " + BG,
    "sales":     "Redraw " + IDENTITY + " Pose: friendly salesperson presenting - both arms/paws open and spread outward in a welcoming 'ta-da / here you go' gesture, confident warm smile. " + BG,
    "mischief":  "Redraw " + IDENTITY + " Expression: playful mischievous - ONE eye winking (closed), a sly cheeky closed smirk/grin, slight raised eyebrow, one paw near the mouth as if giggling secretly. " + BG,
    "sleepy":    "Redraw " + IDENTITY + " Expression: sleepy and drowsy - half-closed droopy relaxed eyes, a tiny small yawn mouth, one paw gently rubbing one eye, calm cozy look. " + BG,
    "warm":      "Redraw " + IDENTITY + " Expression: warm and affectionate - gentle happy closed eyes curved upward, a big warm loving smile, extra rosy blush cheeks, both paws softly near the chest, cozy friendly feel. " + BG,
}


async def gen(name, prompt, ref_bytes):
    chat = LlmChat(api_key=API_KEY, session_id=f"miko-{name}", system_message="You are an expert 2D character sprite artist. Match the reference character exactly.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    msg = UserMessage(text=prompt, file_contents=[ImageContent(base64.b64encode(ref_bytes).decode("utf-8"))])
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        print(f"[FAIL] {name}: no image")
        return
    with open(os.path.join(OUT, f"{name}.png"), "wb") as f:
        f.write(base64.b64decode(images[0]["data"]))
    print(f"[OK] {name}.png")


async def main():
    only = sys.argv[1:] if len(sys.argv) > 1 else list(FRAMES.keys())
    with open(BASE, "rb") as f:
        base_bytes = f.read()
    for name in only:
        if name not in FRAMES:
            print(f"[skip] unknown {name}")
            continue
        try:
            await gen(name, FRAMES[name], base_bytes)
        except Exception as e:
            print(f"[ERR] {name}: {e}")


if __name__ == "__main__":
    asyncio.run(main())
