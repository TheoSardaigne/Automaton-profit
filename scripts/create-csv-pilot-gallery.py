"""Render a truthful synthetic portfolio example; no client data or AI imagery."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

base = Path(__file__).resolve().parents[1]
output = base / "docs" / "assets" / "csv-pilot-example.png"
output.parent.mkdir(parents=True, exist_ok=True)
image = Image.new("RGB", (1280, 800), "#0E1828")
draw = ImageDraw.Draw(image)
fonts = Path("C:/Windows/Fonts")
def font(size, bold=False):
    return ImageFont.truetype(str(fonts / ("segoeuib.ttf" if bold else "segoeui.ttf")), size)

draw.rounded_rectangle((64, 48, 324, 92), radius=12, fill="#193E39")
draw.text((84, 55), "SYNTHETIC DEMO", font=font(23, True), fill="#7CE0B7")
draw.text((64, 118), "Small inventory CSV cleanup", font=font(53, True), fill="#FFFFFF")
draw.text((66, 193), "A clean copy. A clear change report. Your original preserved.", font=font(25), fill="#AFC0D7")

cards = [(64, "INPUT", "5", "synthetic rows", "#A9C8FF"),
         (372, "CLEAN COPY", "3", "rows retained", "#7CE0B7"),
         (680, "EXACT DUPLICATE", "1", "row removed", "#FFD58B"),
         (988, "NEEDS REVIEW", "1", "row quarantined", "#F4A7B4")]
for x, title, value, label, color in cards:
    right = min(x + 228, 1216)
    draw.rounded_rectangle((x, 272, right, 475), radius=18, fill="#1C2B40")
    draw.text((x + 18, 294), title, font=font(17, True), fill=color)
    draw.text((x + 18, 322), value, font=font(74, True), fill="#FFFFFF")
    draw.text((x + 18, 426), label, font=font(19), fill="#B9C8DD")

draw.rounded_rectangle((64, 513, 1216, 675), radius=18, fill="#152E2C")
draw.text((88, 536), "QUALITY CHECK", font=font(19, True), fill="#7CE0B7")
draw.text((88, 573), "5 input = 3 retained + 1 duplicate + 1 quarantined", font=font(30, True), fill="#FFFFFF")
draw.text((88, 624), "Retained quantity total: 20  |  Invalid quantity flagged, never guessed", font=font(22), fill="#C5DED6")
draw.text((64, 715), "Illustrative local example, reviewed by Codex. No client sale or payment claimed.", font=font(20), fill="#AFC0D7")
image.save(output)
print(output)
