#!/usr/bin/env python3
"""
SAM (Segment Anything Model) for ROI Segmentation
Segments signatures, seals, text blocks, and tables
"""

import os
import cv2
import numpy as np
import torch
from pathlib import Path
from typing import List, Tuple, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SAMSegmenter:
    """SAM-based segmentation for document ROI"""

    def __init__(self, model_type: str = "vit_b", device: str = "cuda"):
        """
        Initialize SAM segmenter

        Args:
            model_type: Model type (vit_b, vit_l, vit_h)
            device: Device to use (cuda, cpu)
        """
        self.device = device
        self.model_type = model_type

        try:
            from segment_anything import sam_model_registry, SamPredictor

            self.sam_model_registry = sam_model_registry
            self.SamPredictor = SamPredictor

            # Load model
            self._load_model()
        except ImportError:
            logger.warning("SAM not installed, using fallback segmentation")
            self.predictor = None

    def _load_model(self):
        """Load SAM model"""
        try:
            sam = self.sam_model_registry[self.model_type](pretrained=True)
            sam.to(device=self.device)
            self.predictor = self.SamPredictor(sam)
            logger.info(f"Loaded SAM model: {self.model_type}")
        except Exception as e:
            logger.error(f"Failed to load SAM model: {e}")
            self.predictor = None

    def segment_image(self, image_path: str) -> Dict[str, List[np.ndarray]]:
        """
        Segment image into regions

        Args:
            image_path: Path to input image

        Returns:
            Dictionary with segmentation masks
        """
        try:
            # Read image
            image = cv2.imread(str(image_path))
            if image is None:
                logger.error(f"Failed to read image: {image_path}")
                return {}

            # Convert BGR to RGB
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            if self.predictor:
                # Use SAM for segmentation
                self.predictor.set_image(image_rgb)

                # Get automatic masks
                masks, scores, logits = self.predictor.predict(
                    point_coords=None,
                    point_labels=None,
                    multimask_output=True,
                )

                return {
                    "masks": masks,
                    "scores": scores,
                    "logits": logits,
                }
            else:
                # Fallback: use contour detection
                return self._fallback_segmentation(image)

        except Exception as e:
            logger.error(f"Failed to segment image: {e}")
            return {}

    def segment_roi(
        self, image_path: str, roi: Tuple[int, int, int, int]
    ) -> Dict[str, np.ndarray]:
        """
        Segment a region of interest

        Args:
            image_path: Path to input image
            roi: Region of interest (x, y, width, height)

        Returns:
            Dictionary with segmentation results
        """
        try:
            # Read image
            image = cv2.imread(str(image_path))
            if image is None:
                logger.error(f"Failed to read image: {image_path}")
                return {}

            x, y, w, h = roi

            # Extract ROI
            roi_image = image[y : y + h, x : x + w]
            roi_rgb = cv2.cvtColor(roi_image, cv2.COLOR_BGR2RGB)

            if self.predictor:
                # Use SAM for segmentation
                self.predictor.set_image(roi_rgb)

                # Get automatic masks
                masks, scores, logits = self.predictor.predict(
                    point_coords=None,
                    point_labels=None,
                    multimask_output=True,
                )

                return {
                    "masks": masks,
                    "scores": scores,
                    "logits": logits,
                    "roi": roi,
                }
            else:
                # Fallback: use contour detection
                return self._fallback_segmentation(roi_image)

        except Exception as e:
            logger.error(f"Failed to segment ROI: {e}")
            return {}

    def detect_signatures(self, image_path: str) -> List[Tuple[int, int, int, int]]:
        """
        Detect signatures in image

        Args:
            image_path: Path to input image

        Returns:
            List of signature ROIs (x, y, width, height)
        """
        try:
            # Read image
            image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
            if image is None:
                logger.error(f"Failed to read image: {image_path}")
                return []

            # Apply threshold
            _, binary = cv2.threshold(image, 127, 255, cv2.THRESH_BINARY)

            # Find contours
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            signatures = []
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)

                # Filter by size (signatures are typically 50-300 pixels)
                if 50 < w < 300 and 20 < h < 150:
                    # Check if contour is elongated (signature characteristic)
                    aspect_ratio = w / h if h > 0 else 0
                    if 1.5 < aspect_ratio < 10:
                        signatures.append((x, y, w, h))

            logger.info(f"Detected {len(signatures)} signatures")
            return signatures

        except Exception as e:
            logger.error(f"Failed to detect signatures: {e}")
            return []

    def detect_seals(self, image_path: str) -> List[Tuple[int, int, int, int]]:
        """
        Detect seals/stamps in image

        Args:
            image_path: Path to input image

        Returns:
            List of seal ROIs (x, y, width, height)
        """
        try:
            # Read image
            image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
            if image is None:
                logger.error(f"Failed to read image: {image_path}")
                return []

            # Apply threshold
            _, binary = cv2.threshold(image, 127, 255, cv2.THRESH_BINARY)

            # Find contours
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            seals = []
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)

                # Filter by size (seals are typically circular/square, 30-200 pixels)
                if 30 < w < 200 and 30 < h < 200:
                    # Check if contour is roughly circular
                    area = cv2.contourArea(contour)
                    perimeter = cv2.arcLength(contour, True)
                    circularity = 4 * np.pi * area / (perimeter * perimeter) if perimeter > 0 else 0

                    if circularity > 0.6:  # Circular enough
                        seals.append((x, y, w, h))

            logger.info(f"Detected {len(seals)} seals")
            return seals

        except Exception as e:
            logger.error(f"Failed to detect seals: {e}")
            return []

    def detect_text_blocks(self, image_path: str) -> List[Tuple[int, int, int, int]]:
        """
        Detect text blocks in image

        Args:
            image_path: Path to input image

        Returns:
            List of text block ROIs (x, y, width, height)
        """
        try:
            # Read image
            image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
            if image is None:
                logger.error(f"Failed to read image: {image_path}")
                return []

            # Apply threshold
            _, binary = cv2.threshold(image, 127, 255, cv2.THRESH_BINARY_INV)

            # Dilate to connect nearby text
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            dilated = cv2.dilate(binary, kernel, iterations=2)

            # Find contours
            contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            text_blocks = []
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)

                # Filter by size (text blocks are typically larger)
                if w > 50 and h > 20:
                    text_blocks.append((x, y, w, h))

            logger.info(f"Detected {len(text_blocks)} text blocks")
            return text_blocks

        except Exception as e:
            logger.error(f"Failed to detect text blocks: {e}")
            return []

    def detect_tables(self, image_path: str) -> List[Tuple[int, int, int, int]]:
        """
        Detect tables in image

        Args:
            image_path: Path to input image

        Returns:
            List of table ROIs (x, y, width, height)
        """
        try:
            # Read image
            image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
            if image is None:
                logger.error(f"Failed to read image: {image_path}")
                return []

            # Apply threshold
            _, binary = cv2.threshold(image, 127, 255, cv2.THRESH_BINARY)

            # Detect lines (tables have grid lines)
            horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
            vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))

            horizontal_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel)
            vertical_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel)

            # Combine lines
            grid = cv2.add(horizontal_lines, vertical_lines)

            # Find contours
            contours, _ = cv2.findContours(grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            tables = []
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)

                # Filter by size (tables are typically large)
                if w > 100 and h > 100:
                    tables.append((x, y, w, h))

            logger.info(f"Detected {len(tables)} tables")
            return tables

        except Exception as e:
            logger.error(f"Failed to detect tables: {e}")
            return []

    def _fallback_segmentation(self, image: np.ndarray) -> Dict[str, List[np.ndarray]]:
        """Fallback segmentation using contour detection"""
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY)

            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            masks = []
            for contour in contours:
                mask = np.zeros(image.shape[:2], dtype=np.uint8)
                cv2.drawContours(mask, [contour], 0, 255, -1)
                masks.append(mask)

            return {"masks": masks}

        except Exception as e:
            logger.error(f"Fallback segmentation failed: {e}")
            return {}


def main():
    """Test SAM segmenter"""
    segmenter = SAMSegmenter(model_type="vit_b", device="cuda")

    # Test segmentation
    test_image = "test_image.png"

    if os.path.exists(test_image):
        # Detect various elements
        signatures = segmenter.detect_signatures(test_image)
        seals = segmenter.detect_seals(test_image)
        text_blocks = segmenter.detect_text_blocks(test_image)
        tables = segmenter.detect_tables(test_image)

        logger.info(f"Signatures: {len(signatures)}")
        logger.info(f"Seals: {len(seals)}")
        logger.info(f"Text blocks: {len(text_blocks)}")
        logger.info(f"Tables: {len(tables)}")
    else:
        logger.warning(f"Test image not found: {test_image}")


if __name__ == "__main__":
    main()
