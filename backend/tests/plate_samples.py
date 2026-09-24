
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

PLATE_WIDTH = 520
PLATE_HEIGHT = 169


@lru_cache(maxsize=8)
def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def _draw_centered(draw: ImageDraw.ImageDraw, box, text: str, font, fill) -> None:
    left, top, right, bottom = box
    bbox = draw.textbbox((0, 0), text, font=font)
    width, height = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = left + (right - left - width) / 2 - bbox[0]
    y = top + (bottom - top - height) / 2 - bbox[1]
    draw.text((x, y), text, font=font, fill=fill)


def render_plate(plate: str, *, ink: int = 20, background: int = 245) -> np.ndarray:
    mercosul = plate[4].isalpha()
    if mercosul:
        image = Image.new("RGB", (PLATE_WIDTH, PLATE_HEIGHT), (background,) * 3)
        draw = ImageDraw.Draw(image)
        band_height = int(PLATE_HEIGHT * 0.2)
        draw.rectangle([0, 0, PLATE_WIDTH, band_height], fill=(40, 60, 160))
        _draw_centered(draw, (0, 0, PLATE_WIDTH, band_height), "BRASIL", _font(24), (255, 255, 255))
        text, text_box = plate, (10, band_height + 6, PLATE_WIDTH - 10, PLATE_HEIGHT - 8)
    else:
        gray = int(background * 0.8)
        image = Image.new("RGB", (PLATE_WIDTH, PLATE_HEIGHT), (gray,) * 3)
        draw = ImageDraw.Draw(image)
        _draw_centered(draw, (0, 4, PLATE_WIDTH, 34), "SP - SAO PAULO", _font(20), (ink,) * 3)
        text, text_box = f"{plate[:3]}-{plate[3:]}", (10, 36, PLATE_WIDTH - 10, PLATE_HEIGHT - 8)

    _draw_centered(draw, text_box, text, _font(118), (ink,) * 3)
    draw.rectangle([0, 0, PLATE_WIDTH - 1, PLATE_HEIGHT - 1], outline=(ink,) * 3, width=4)
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def _truck_scene(rng: np.random.Generator, width: int = 1600, height: int = 1200) -> np.ndarray:
    scene = np.zeros((height, width, 3), dtype=np.uint8)
    scene[:] = rng.integers(90, 130, size=3)
    for y in range(80, int(height * 0.55), 28):
        cv2.rectangle(scene, (200, y), (width - 200, y + 14), (45, 45, 50), -1)
    cv2.rectangle(scene, (60, int(height * 0.62)), (width - 60, int(height * 0.9)), (35, 35, 38), -1)
    for x in (150, width - 350):
        cv2.rectangle(scene, (x, int(height * 0.45)), (x + 200, int(height * 0.55)), (200, 200, 190), -1)
    noise = rng.normal(0, 6, scene.shape)
    return np.clip(scene + noise, 0, 255).astype(np.uint8)


def _place(scene: np.ndarray, plate: np.ndarray, center, width: int, *, yaw: float = 0.0, roll: float = 0.0):
    ph, pw = plate.shape[:2]
    height = width * ph / pw
    cx, cy = center
    shrink = yaw * height / 2
    corners = np.float32(
        [
            [-width / 2, -height / 2],
            [width / 2, -height / 2 + shrink],
            [width / 2, height / 2 - shrink],
            [-width / 2, height / 2],
        ]
    )
    angle = np.deg2rad(roll)
    rotation = np.float32([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    destination = corners @ rotation.T + np.float32([cx, cy])
    source = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    matrix = cv2.getPerspectiveTransform(source, destination)
    size = (scene.shape[1], scene.shape[0])
    warped = cv2.warpPerspective(plate, matrix, size, flags=cv2.INTER_AREA)
    mask = cv2.warpPerspective(np.full((ph, pw), 255, np.uint8), matrix, size)
    scene[mask > 0] = warped[mask > 0]
    return scene


def _dirt(plate: np.ndarray, rng: np.random.Generator, amount: int) -> np.ndarray:
    dirty = plate.copy()
    h, w = dirty.shape[:2]
    for _ in range(amount):
        center = (int(rng.integers(0, w)), int(rng.integers(0, h)))
        axes = (int(rng.integers(6, 26)), int(rng.integers(4, 14)))
        color = tuple(int(c) for c in rng.integers(60, 120, size=3))
        overlay = dirty.copy()
        cv2.ellipse(overlay, center, axes, float(rng.integers(0, 180)), 0, 360, color, -1)
        dirty = cv2.addWeighted(overlay, 0.45, dirty, 0.55, 0)
    for _ in range(amount // 2):
        p1 = (int(rng.integers(0, w)), int(rng.integers(0, h)))
        p2 = (p1[0] + int(rng.integers(-60, 60)), p1[1] + int(rng.integers(-20, 20)))
        cv2.line(dirty, p1, p2, (170, 170, 170), 2)
    return dirty


def _glare(image: np.ndarray, center, axes, strength: float) -> np.ndarray:
    mask = np.zeros(image.shape[:2], np.float32)
    cv2.ellipse(mask, center, axes, -15, 0, 360, 1.0, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=axes[0] / 3)
    glared = image.astype(np.float32) + mask[..., None] * 255 * strength
    return np.clip(glared, 0, 255).astype(np.uint8)


def _motion_blur(image: np.ndarray, size: int) -> np.ndarray:
    kernel = np.zeros((size, size), np.float32)
    kernel[size // 2, :] = 1.0 / size
    return cv2.filter2D(image, -1, kernel)


def _darken(image: np.ndarray, factor: float, rng: np.random.Generator, noise: float) -> np.ndarray:
    dark = image.astype(np.float32) * factor
    dark += rng.normal(0, noise, image.shape)
    return np.clip(dark, 0, 255).astype(np.uint8)


def _jpeg(image: np.ndarray, quality: int) -> bytes:
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return encoded.tobytes()


def _backlight(scene: np.ndarray, rng: np.random.Generator, flare_center, flare_axes) -> np.ndarray:
    result = scene.astype(np.float32) * 0.32
    for scale, strength, blur in ((0.4, 2.2, flare_axes[0] / 3), (1.0, 0.55, flare_axes[0] / 2.2),
                                   (1.7, 0.18, 10), (2.5, 0.08, 14)):
        mask = np.zeros(scene.shape[:2], np.float32)
        axes = (int(flare_axes[0] * scale), int(flare_axes[1] * scale))
        cv2.ellipse(mask, flare_center, axes, 0, 0, 360, 1.0, -1 if scale <= 1.0 else 6)
        mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=blur)
        result += mask[..., None] * 255 * strength
    result += rng.normal(0, 5, scene.shape)
    return np.clip(result, 0, 255).astype(np.uint8)


def _rain(scene: np.ndarray, rng: np.random.Generator, streaks: int = 45, droplets: int = 25) -> np.ndarray:
    overlay = scene.copy()
    for _ in range(streaks):
        x, y = int(rng.integers(0, scene.shape[1])), int(rng.integers(-20, scene.shape[0]))
        length = int(rng.integers(15, 40))
        angle = np.deg2rad(75 + rng.uniform(-8, 8))
        end = (x + int(length * np.cos(angle)), y + int(length * np.sin(angle)))
        cv2.line(overlay, (x, y), end, (225, 225, 225), 1, cv2.LINE_AA)
    result = cv2.addWeighted(overlay, 0.35, scene, 0.65, 0)
    for _ in range(droplets):
        center = (int(rng.integers(0, scene.shape[1])), int(rng.integers(0, scene.shape[0])))
        radius = int(rng.integers(3, 10))
        droplet = result.copy()
        cv2.circle(droplet, center, radius, (255, 255, 255), -1)
        droplet = cv2.GaussianBlur(droplet, (0, 0), sigmaX=radius / 1.5)
        result = cv2.addWeighted(droplet, 0.18, result, 0.82, 0)
    return cv2.GaussianBlur(result, (0, 0), sigmaX=1.1)


def _scratches(plate: np.ndarray, rng: np.random.Generator, amount: int) -> np.ndarray:
    scratched = plate.copy()
    height, width = scratched.shape[:2]
    for _ in range(amount):
        start = (int(rng.integers(0, width)), int(rng.integers(0, height)))
        length = int(rng.integers(30, width))
        angle = rng.uniform(0, 2 * np.pi)
        end = (
            int(np.clip(start[0] + length * np.cos(angle), 0, width - 1)),
            int(np.clip(start[1] + length * np.sin(angle), 0, height - 1)),
        )
        color = (230, 230, 230) if rng.random() < 0.7 else (30, 30, 30)
        cv2.line(scratched, start, end, color, int(rng.integers(1, 3)), cv2.LINE_AA)
    return scratched


@dataclass(frozen=True)
class PlateSample:
    name: str
    plate: str
    description: str
    image_bytes: bytes


def _build(name, plate, description, seed, *, plate_width=560, yaw=0.0, roll=0.0, dirt=0, worn=False,
           scratches=0, glare=None, backlight=None, rain=False, darken=None, blur=0,
           quality=85) -> PlateSample:
    rng = np.random.default_rng(seed)
    plate_image = render_plate(plate, ink=105 if worn else 20, background=200 if worn else 245)
    if dirt:
        plate_image = _dirt(plate_image, rng, dirt)
    if scratches:
        plate_image = _scratches(plate_image, rng, scratches)
    scene = _truck_scene(rng)
    center = (800 + int(rng.integers(-60, 60)), 870 + int(rng.integers(-30, 30)))
    scene = _place(scene, plate_image, center, plate_width, yaw=yaw, roll=roll)
    if glare:
        dx, dy, ax, ay, strength = glare
        scene = _glare(scene, (center[0] + dx, center[1] + dy), (ax, ay), strength)
    if backlight:
        dx, dy, ax, ay = backlight
        scene = _backlight(scene, rng, (center[0] + dx, center[1] + dy), (ax, ay))
    if rain:
        scene = _rain(scene, rng)
    if blur:
        scene = _motion_blur(scene, blur)
    if darken:
        factor, noise = darken
        scene = _darken(scene, factor, rng, noise)
    return PlateSample(name, plate, description, _jpeg(scene, quality))


def hard_cases() -> list[PlateSample]:
    return [
        _build("limpa_mercosul", "BRA2E19", "foto boa, controle", 1),
        _build("limpa_antiga", "KLM4821", "foto boa, placa antiga, controle", 2),
        _build("pouca_luz", "QRS3T45", "fim de tarde: imagem escura", 3, darken=(0.28, 4)),
        _build("noite_ruido", "HJK7L20", "noite: muito escura e granulada", 4, darken=(0.16, 7)),
        _build("pouca_luz_antiga", "GTR5093", "placa antiga com pouca luz", 5, darken=(0.25, 5)),
        _build("angulo_lateral", "MNO8P61", "fotografada de lado", 6, yaw=0.35),
        _build("inclinada", "DEF1G23", "celular torto (~10°)", 7, roll=10),
        _build("angulo_e_inclinada", "TUV6W78", "de lado e torta", 8, yaw=0.3, roll=-8),
        _build("tremida", "XYZ9A87", "mão tremendo (borrão de movimento)", 9, blur=9),
        _build("suja", "LMN2B34", "placa com barro e riscos", 10, dirt=18),
        _build("desgastada", "PQR7C56", "tinta desbotada, pouco contraste", 11, worn=True),
        _build("reflexo", "STU0D12", "reflexo do sol em parte da placa", 12, glare=(-140, 0, 110, 60, 0.85)),
        _build("reflexo_antiga", "CDE3456", "reflexo forte em placa antiga", 13, glare=(160, 10, 90, 55, 0.8)),
        _build("longe_jpeg", "FGH4E89", "placa pequena na foto e JPEG comprimido", 14, plate_width=260, quality=40),
        _build("escura_de_lado", "JKL6F01", "pouca luz + ângulo", 15, darken=(0.3, 5), yaw=0.3),
        _build("suja_com_reflexo", "VWX8G23", "sujeira + reflexo", 16, dirt=12, glare=(100, -10, 80, 50, 0.7)),
        _build("contraluz_farol", "GHP4K05", "contraluz de farol à noite", 17, backlight=(-70, -30, 95, 85)),
        _build("contraluz_sol", "RJT8L33", "sol baixo do fim de tarde de frente pra câmera", 18,
               backlight=(90, -50, 100, 95)),
        _build("chuva", "NVK5M62", "chovendo: lente molhada, riscos e gotas", 19, rain=True),
        _build("chuva_pouca_luz", "OPW1Y74", "chuva à noite, pouca luz", 20, rain=True, darken=(0.35, 5)),
        _build("arranhada", "ZQX7B15", "placa com arranhões fundos cruzando os caracteres", 21, scratches=6),
        _build("arranhada_suja", "HFD2N88", "arranhada e com barro por cima", 22, scratches=4, dirt=10),
        _build("contraluz_chuva", "ELS6C40", "contraluz de farol na chuva — pior caso combinado", 23,
               backlight=(-60, -20, 95, 85), rain=True),
    ]


LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _random_plate(rng: np.random.Generator) -> str:
    letters = "".join(rng.choice(list(LETTERS), size=3))
    digits = rng.integers(0, 10, size=4)
    fifth = LETTERS[int(rng.integers(0, 26))] if rng.random() < 0.6 else str(digits[1])
    return f"{letters}{digits[0]}{fifth}{digits[2]}{digits[3]}"


def random_cases(count: int = 40, seed: int = 2026) -> list[PlateSample]:
    rng = np.random.default_rng(seed)
    samples = []
    for index in range(count):
        options = {
            "plate_width": int(rng.integers(240, 620)),
            "yaw": float(rng.uniform(0, 0.35)) if rng.random() < 0.4 else 0.0,
            "roll": float(rng.uniform(-10, 10)) if rng.random() < 0.4 else 0.0,
            "dirt": int(rng.integers(6, 18)) if rng.random() < 0.3 else 0,
            "worn": bool(rng.random() < 0.2),
            "blur": int(rng.choice([5, 7, 9])) if rng.random() < 0.25 else 0,
            "darken": (float(rng.uniform(0.18, 0.45)), float(rng.uniform(3, 7))) if rng.random() < 0.35 else None,
            "glare": (int(rng.integers(-150, 150)), 0, int(rng.integers(60, 110)), 50, float(rng.uniform(0.5, 0.85)))
            if rng.random() < 0.2
            else None,
            "backlight": (int(rng.integers(-80, 80)), int(rng.integers(-50, 0)), int(rng.integers(90, 170)),
                          int(rng.integers(80, 140)))
            if rng.random() < 0.15
            else None,
            "rain": bool(rng.random() < 0.15),
            "scratches": int(rng.integers(3, 8)) if rng.random() < 0.15 else 0,
            "quality": int(rng.integers(40, 90)),
        }
        applied = [name for name, value in options.items() if value and name not in ("plate_width", "quality")]
        samples.append(
            _build(f"aleatoria_{index:02d}", _random_plate(rng), ", ".join(applied) or "sem degradação",
                   seed * 100 + index, **options)
        )
    return samples


if __name__ == "__main__":
    import sys

    output = Path(sys.argv[1] if len(sys.argv) > 1 else "plate_samples")
    output.mkdir(parents=True, exist_ok=True)
    for sample in [*hard_cases(), *random_cases()]:
        (output / f"{sample.name}_{sample.plate}.jpg").write_bytes(sample.image_bytes)
    print(f"imagens salvas em {output}/")
