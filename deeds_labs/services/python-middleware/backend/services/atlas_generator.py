"""
N64 Tile Atlas Generator

Generates 32×32 tiles for each rune symbol and composes them into an 8-column atlas grid.
Integrates with PIL for rendering and MinIO for storage.

Usage:
    generator = AtlasGenerator()
    atlas = generator.build_rune_atlas()
    generator.export_atlas_to_minio(atlas, "rune_atlas.png")
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import io
import logging
from typing import List, Tuple, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Base runes (26 symbols)
BASE_RUNES = [
    "𓂀", "✶", "◎", "⚖", "◈", "❂", "𓇳", "✧",
    "⚕", "✤", "☉", "◐", "𓅓", "◉", "●", "✱",
    "⚚", "𓃠", "✺", "⚔", "✦", "𓁹", "❖", "✴",
    "𓋹", "❉"
]


class AtlasGenerator:
    """Generate N64-style tile atlas from runes"""

    def __init__(self, tile_size: int = 32, cols: int = 8, font_size: int = 28):
        """
        Initialize atlas generator.

        Args:
            tile_size: Size of each tile (32×32)
            cols: Number of columns in atlas grid (8)
            font_size: Font size for rendering runes (28)
        """
        self.tile_size = tile_size
        self.cols = cols
        self.font_size = font_size
        self.runes = BASE_RUNES
        self.num_runes = len(self.runes)
        self.rows = (self.num_runes + self.cols - 1) // self.cols

        # Try to load NotoSansSymbols2 font, fallback to default
        self.font = self._load_font()

    def _load_font(self) -> ImageFont.FreeTypeFont:
        """Load NotoSansSymbols2 font or fallback to default."""
        font_paths = [
            "/usr/share/fonts/opentype/noto/NotoSansSymbols2-Regular.ttf",
            "/System/Library/Fonts/NotoSansSymbols2-Regular.ttf",
            "C:\\Windows\\Fonts\\NotoSansSymbols2-Regular.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf",
        ]

        for font_path in font_paths:
            try:
                return ImageFont.truetype(font_path, self.font_size)
            except (OSError, IOError):
                continue

        logger.warning("NotoSansSymbols2 font not found, using default font")
        return ImageFont.load_default()

    def build_rune_atlas(self) -> Image.Image:
        """
        Build complete rune atlas with all 26 runes.

        Returns:
            PIL Image of atlas (8 columns × 4 rows of 32×32 tiles)
        """
        # Create atlas image (grayscale, 8-column grid)
        atlas_width = self.cols * self.tile_size
        atlas_height = self.rows * self.tile_size
        atlas = Image.new("L", (atlas_width, atlas_height), 0)

        # Draw each rune
        for idx, rune in enumerate(self.runes):
            row = idx // self.cols
            col = idx % self.cols

            # Compute tile position
            x = col * self.tile_size
            y = row * self.tile_size

            # Draw rune on tile
            self._draw_rune_on_tile(atlas, rune, x, y)

        logger.info(f"Built atlas: {atlas_width}×{atlas_height} ({self.num_runes} runes)")
        return atlas

    def _draw_rune_on_tile(self, atlas: Image.Image, rune: str, x: int, y: int) -> None:
        """
        Draw a single rune on the atlas at position (x, y).

        Args:
            atlas: PIL Image to draw on
            rune: Rune symbol to draw
            x: X coordinate of tile
            y: Y coordinate of tile
        """
        # Create temporary image for this tile
        tile = Image.new("L", (self.tile_size, self.tile_size), 0)
        draw = ImageDraw.Draw(tile)

        # Draw rune centered in tile
        try:
            bbox = draw.textbbox((0, 0), rune, font=self.font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]

            # Center text
            text_x = (self.tile_size - text_width) // 2
            text_y = (self.tile_size - text_height) // 2

            draw.text((text_x, text_y), rune, font=self.font, fill=255)
        except Exception as e:
            logger.warning(f"Failed to draw rune {rune}: {e}")

        # Paste tile onto atlas
        atlas.paste(tile, (x, y))

    def get_tile_index(self, rune: str) -> Optional[int]:
        """
        Get tile index for a rune.

        Args:
            rune: Rune symbol

        Returns:
            Tile index (0-25) or None if not found
        """
        try:
            return self.runes.index(rune)
        except ValueError:
            return None

    def get_tile_from_atlas(self, atlas: Image.Image, index: int) -> Optional[Image.Image]:
        """
        Extract a single tile from atlas by index.

        Args:
            atlas: Atlas image
            index: Tile index (0-25)

        Returns:
            32×32 tile image or None if index out of bounds
        """
        if index < 0 or index >= self.num_runes:
            return None

        row = index // self.cols
        col = index % self.cols

        x = col * self.tile_size
        y = row * self.tile_size

        # Crop tile from atlas
        box = (x, y, x + self.tile_size, y + self.tile_size)
        return atlas.crop(box)

    def get_tile_as_array(self, atlas: Image.Image, index: int) -> Optional[np.ndarray]:
        """
        Get tile as numpy array (uint8, 32×32).

        Args:
            atlas: Atlas image
            index: Tile index

        Returns:
            Numpy array or None
        """
        tile = self.get_tile_from_atlas(atlas, index)
        if tile is None:
            return None

        return np.array(tile, dtype=np.uint8)

    def export_atlas_to_file(self, atlas: Image.Image, filepath: str) -> None:
        """
        Export atlas to PNG file.

        Args:
            atlas: Atlas image
            filepath: Output file path
        """
        atlas.save(filepath, "PNG")
        logger.info(f"Exported atlas to {filepath}")

    def export_atlas_to_bytes(self, atlas: Image.Image) -> bytes:
        """
        Export atlas to bytes (PNG format).

        Args:
            atlas: Atlas image

        Returns:
            PNG bytes
        """
        buffer = io.BytesIO()
        atlas.save(buffer, format="PNG")
        return buffer.getvalue()

    def export_atlas_to_minio(self, atlas: Image.Image, bucket: str, key: str) -> bool:
        """
        Export atlas to MinIO storage.

        Args:
            atlas: Atlas image
            bucket: MinIO bucket name
            key: Object key (e.g., "rune_atlas.png")

        Returns:
            True if successful, False otherwise
        """
        try:
            from minio import Minio
            import os

            # Get MinIO credentials from environment
            minio_endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
            minio_access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
            minio_secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")

            # Create MinIO client
            client = Minio(
                minio_endpoint,
                access_key=minio_access_key,
                secret_key=minio_secret_key,
                secure=False,
            )

            # Convert atlas to bytes
            atlas_bytes = self.export_atlas_to_bytes(atlas)

            # Upload to MinIO
            client.put_object(
                bucket,
                key,
                io.BytesIO(atlas_bytes),
                length=len(atlas_bytes),
                content_type="image/png",
            )

            logger.info(f"Exported atlas to MinIO: {bucket}/{key}")
            return True

        except Exception as e:
            logger.error(f"Failed to export atlas to MinIO: {e}")
            return False

    def verify_atlas_integrity(self, atlas: Image.Image) -> Tuple[bool, List[str]]:
        """
        Verify atlas integrity.

        Args:
            atlas: Atlas image

        Returns:
            Tuple of (is_valid, errors)
        """
        errors = []

        # Check dimensions
        expected_width = self.cols * self.tile_size
        expected_height = self.rows * self.tile_size

        if atlas.size != (expected_width, expected_height):
            errors.append(
                f"Invalid atlas size: {atlas.size}, expected {(expected_width, expected_height)}"
            )

        # Check mode
        if atlas.mode != "L":
            errors.append(f"Invalid image mode: {atlas.mode}, expected L (grayscale)")

        # Check tiles are not empty
        for idx in range(self.num_runes):
            tile = self.get_tile_as_array(atlas, idx)
            if tile is None:
                errors.append(f"Failed to extract tile {idx}")
            elif np.all(tile == 0):
                errors.append(f"Tile {idx} is empty (all zeros)")

        return len(errors) == 0, errors

    def get_base_runes(self) -> List[str]:
        """Get list of base runes."""
        return self.runes.copy()

    def get_rune_count(self) -> int:
        """Get number of runes."""
        return self.num_runes

    def get_atlas_dimensions(self) -> Tuple[int, int]:
        """Get atlas dimensions (width, height)."""
        return (self.cols * self.tile_size, self.rows * self.tile_size)


# Convenience functions

def build_rune_atlas() -> Image.Image:
    """Build rune atlas (convenience function)."""
    generator = AtlasGenerator()
    return generator.build_rune_atlas()


def get_tile_index(rune: str) -> Optional[int]:
    """Get tile index for rune (convenience function)."""
    generator = AtlasGenerator()
    return generator.get_tile_index(rune)


def export_atlas_to_file(filepath: str) -> None:
    """Export atlas to file (convenience function)."""
    generator = AtlasGenerator()
    atlas = generator.build_rune_atlas()
    generator.export_atlas_to_file(atlas, filepath)


if __name__ == "__main__":
    # Example usage
    import sys

    logging.basicConfig(level=logging.INFO)

    generator = AtlasGenerator()

    # Build atlas
    atlas = generator.build_rune_atlas()
    print(f"Atlas size: {atlas.size}")
    print(f"Atlas mode: {atlas.mode}")

    # Verify integrity
    is_valid, errors = generator.verify_atlas_integrity(atlas)
    print(f"Atlas valid: {is_valid}")
    if errors:
        for error in errors:
            print(f"  - {error}")

    # Export to file
    output_path = sys.argv[1] if len(sys.argv) > 1 else "rune_atlas.png"
    generator.export_atlas_to_file(atlas, output_path)
    print(f"Exported to {output_path}")

    # Extract sample tile
    tile = generator.get_tile_from_atlas(atlas, 0)
    if tile:
        print(f"Sample tile (index 0): {tile.size}")
