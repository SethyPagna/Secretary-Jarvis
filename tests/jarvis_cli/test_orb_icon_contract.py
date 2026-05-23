import struct
import unittest
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _read_rgba_png(path: Path) -> tuple[int, int, bytes]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise AssertionError("Not a PNG file")

    pos = len(PNG_SIGNATURE)
    width = height = None
    color_type = None
    idat = bytearray()

    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        chunk_type = data[pos + 4:pos + 8]
        chunk_data = data[pos + 8:pos + 8 + length]
        pos += 12 + length

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", chunk_data
            )
            if (bit_depth, color_type, compression, filter_method, interlace) != (8, 6, 0, 0, 0):
                raise AssertionError("Icon PNG must be non-interlaced 8-bit RGBA")
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if width is None or height is None or color_type != 6:
        raise AssertionError("Missing RGBA IHDR")

    raw = zlib.decompress(bytes(idat))
    stride = width * 4
    rows = []
    offset = 0
    previous = bytearray(stride)
    for _ in range(height):
        filter_type = raw[offset]
        offset += 1
        current = bytearray(raw[offset:offset + stride])
        offset += stride
        for i in range(stride):
            left = current[i - 4] if i >= 4 else 0
            up = previous[i]
            upper_left = previous[i - 4] if i >= 4 else 0
            if filter_type == 1:
                current[i] = (current[i] + left) & 0xFF
            elif filter_type == 2:
                current[i] = (current[i] + up) & 0xFF
            elif filter_type == 3:
                current[i] = (current[i] + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                current[i] = (current[i] + _paeth(left, up, upper_left)) & 0xFF
            elif filter_type != 0:
                raise AssertionError(f"Unsupported PNG filter: {filter_type}")
        rows.append(bytes(current))
        previous = current

    return width, height, b"".join(rows)


class OrbIconContractTests(unittest.TestCase):
    def test_icon_png_is_large_transparent_orb_without_background_frame(self) -> None:
        icon = ROOT / "assets" / "icon.png"
        width, height, rgba = _read_rgba_png(icon)

        self.assertEqual((width, height), (1024, 1024))

        def alpha_at(x: int, y: int) -> int:
            return rgba[((y * width) + x) * 4 + 3]

        self.assertLessEqual(alpha_at(0, 0), 2)
        self.assertLessEqual(alpha_at(width - 1, 0), 2)
        self.assertLessEqual(alpha_at(0, height - 1), 2)
        self.assertLessEqual(alpha_at(width - 1, height - 1), 2)
        self.assertGreaterEqual(alpha_at(width // 2, height // 2), 240)

    def test_windows_icon_is_generated_for_packaging(self) -> None:
        ico = ROOT / "assets" / "icon.ico"
        self.assertTrue(ico.is_file())
        self.assertGreater(ico.stat().st_size, 1000)
        self.assertEqual(ico.read_bytes()[:4], b"\x00\x00\x01\x00")

    def test_icon_generator_is_committed(self) -> None:
        generator = ROOT / "scripts" / "generate-orb-icon.ps1"
        source = generator.read_text(encoding="utf-8")

        self.assertIn("System.Drawing", source)
        self.assertIn("Transparent", source)
        self.assertIn("assets/icon.png", source)
        self.assertIn("assets/icon.ico", source)


if __name__ == "__main__":
    unittest.main()
