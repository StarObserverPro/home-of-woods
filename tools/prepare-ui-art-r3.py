"""Crop ImageGen masters into the game's transparent 64/128 px icon pairs."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".cache/ui-art-r3"
OUTPUT = ROOT / "public/assets/ui-r3"
SHEETS = {
    "controls": (3, 2, (
        "weather-sun", "weather-cloud", "weather-rain",
        "weather-snow", "approach", "camera-reset",
    )),
    "fruit": (4, 3, (
        "wood-mushroom", "shelf-mushroom", "wood-ear", "serviceberry",
        "forest-berry", "blue-forest-berry", "red-forest-berry", "forest-nut",
        "tree-resin", "forest-seed", "dried-forest-fruit", "nut-rations",
    )),
    "supplies": (3, 2, (
        "sap-can", "sap-filled-can", "forest-syrup",
        "conifer-mushroom", "hardwood-mushroom", "festival-spark",
    )),
    "extra": (3, 2, (
        "forest-leaf", "camera-left", "camera-right",
        "camera-raise", "camera-zoom-in", "camera-zoom-out",
    )),
}


def cut(tile):
    alpha = tile.getchannel("A")
    # The alpha matte from some sheets has a soft halo outside the object.
    # Keep the coverage ramp at its contour and clear the much fainter fringe.
    alpha = alpha.point(lambda value: max(0, min(255, round((value - 80) * 255 / 130))))
    bounds = alpha.point(lambda value: 255 if value >= 128 else 0).getbbox()
    if bounds is None or min(bounds[2] - bounds[0], bounds[3] - bounds[1]) < 35:
        raise ValueError("Cell lacks a substantial silhouette")
    if min(bounds[0], bounds[1], tile.width - bounds[2], tile.height - bounds[3]) < 2:
        raise ValueError("Silhouette intersects a cell boundary")
    tile.putalpha(alpha)
    return tile.crop(alpha.getbbox())


def main():
    output_icons = OUTPUT / "icons"
    output_icons.mkdir(parents=True, exist_ok=True)
    records = []
    for sheet_name, (columns, rows, names) in SHEETS.items():
        source = SOURCE / f"{sheet_name}.png"
        with Image.open(source) as sheet:
            if sheet.mode != "RGBA" or max(sheet.size) > 2048:
                raise ValueError(f"Expected an RGBA sheet no larger than 2048×2048: {source}")
            for index, name in enumerate(names):
                row, column = divmod(index, columns)
                # The zoom glyphs on the bottom row are shifted left in the master.
                x_edges = [0, 418, 805, sheet.width] if sheet_name == "extra" and row == 1 else [
                    round(x * sheet.width / columns) for x in range(columns + 1)
                ]
                cell = (
                    x_edges[column], round(row * sheet.height / rows),
                    x_edges[column + 1], round((row + 1) * sheet.height / rows),
                )
                icon = cut(sheet.crop(cell))
                variants = [(name, icon)]
                if name == "camera-raise":
                    variants.append(("camera-lower", ImageOps.flip(icon)))
                for icon_name, variant in variants:
                    for size in (64, 128):
                        fit = ImageOps.contain(variant, (round(size * .82),) * 2, Image.Resampling.LANCZOS)
                        square = Image.new("RGBA", (size, size))
                        square.paste(fit, ((size - fit.width) // 2, (size - fit.height) // 2))
                        file = output_icons / f"{icon_name}-{size}.png"
                        square.save(file, optimize=True)
                        data = file.read_bytes()
                        records.append({
                            "id": icon_name, "size": size, "file": file.relative_to(ROOT).as_posix(),
                            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                            "sourceBatch": sheet_name,
                        })
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "batch": "HOW-UI-ART-R3",
        "source": "Built-in ImageGen sheets, with project R1 icon artwork as style reference.",
        "rights": "AI-generated artwork. Not CC0.",
        "files": records,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
