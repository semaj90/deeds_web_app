#!/usr/bin/env python3
"""
Real-ESRGAN Upscaler for Low-Confidence Evidence ROI
Upscales low-quality document regions for better OCR
"""

import os
import cv2
import numpy as np
import torch
from pathlib import Path
from typing import Tuple, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RealESRGANUpscaler:
    """Real-ESRGAN upscaler for document enhancement"""

    def __init__(self, model_name: str = "RealESRGAN_x2plus", device: str = "cuda"):
        """
        Initialize Real-ESRGAN upscaler

        Args:
            model_name: Model to use (RealESRGAN_x2plus, RealESRGAN_x4plus)
            device: Device to use (cuda, cpu)
        """
        self.device = device
        self.model_name = model_name

        try:
            # Try to import Real-ESRGAN
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer

            self.RealESRGANer = RealESRGANer
            self.RRDBNet = RRDBNet

            # Load model
            self._load_model()
        except ImportError:
            logger.warning("Real-ESRGAN not installed, using fallback upscaling")
            self.upsampler = None

    def _load_model(self):
        """Load Real-ESRGAN model"""
        try:
            if self.model_name == "RealESRGAN_x2plus":
                num_out_ch = 3
                model_num_feat = 64
                model_num_block = 23
                upscale = 2
            elif self.model_name == "RealESRGAN_x4plus":
                num_out_ch = 3
                model_num_feat = 64
                model_num_block = 23
                upscale = 4
            else:
                raise ValueError(f"Unknown model: {self.model_name}")

            model = self.RRDBNet(
                num_in_ch=3,
                num_out_ch=num_out_ch,
                num_feat=model_num_feat,
                num_block=model_num_block,
                num_grow_ch=32,
                scale=upscale,
            )

            self.upsampler = self.RealESRGANer(
                upscale,
                "cpu",  # Use CPU for model loading
                model,
                tile=400,
                tile_pad=10,
                pre_pad=0,
                half=False,
            )

            logger.info(f"Loaded {self.model_name} model")
        except Exception as e:
            logger.error(f"Failed to load Real-ESRGAN model: {e}")
            self.upsampler = None

    def upscale(self, image_path: str, output_path: str, scale: int = 2) -> bool:
        """
        Upscale an image

        Args:
            image_path: Path to input image
            output_path: Path to output image
            scale: Upscaling factor (2 or 4)

        Returns:
            True if successful, False otherwise
        """
        try:
            # Read image
            img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return False

            # Upscale
            if self.upsampler:
                upscaled, _ = self.upsampler.enhance(img, outscale=scale)
            else:
                # Fallback: use OpenCV upscaling
                upscaled = cv2.resize(
                    img,
                    None,
                    fx=scale,
                    fy=scale,
                    interpolation=cv2.INTER_CUBIC,
                )

            # Save output
            cv2.imwrite(str(output_path), upscaled)
            logger.info(f"Upscaled image saved to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to upscale image: {e}")
            return False

    def upscale_roi(
        self, image_path: str, roi: Tuple[int, int, int, int], output_path: str
    ) -> bool:
        """
        Upscale a region of interest (ROI)

        Args:
            image_path: Path to input image
            roi: Region of interest (x, y, width, height)
            output_path: Path to output image

        Returns:
            True if successful, False otherwise
        """
        try:
            # Read image
            img = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return False

            x, y, w, h = roi

            # Extract ROI
            roi_img = img[y : y + h, x : x + w]

            # Upscale ROI
            if self.upsampler:
                upscaled_roi, _ = self.upsampler.enhance(roi_img, outscale=2)
            else:
                upscaled_roi = cv2.resize(
                    roi_img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC
                )

            # Create output image
            output_img = img.copy()

            # Resize output image to accommodate upscaled ROI
            new_h = img.shape[0] + upscaled_roi.shape[0] - h
            new_w = img.shape[1] + upscaled_roi.shape[1] - w
            output_img = cv2.resize(output_img, (new_w, new_h))

            # Place upscaled ROI
            output_img[y : y + upscaled_roi.shape[0], x : x + upscaled_roi.shape[1]] = (
                upscaled_roi
            )

            # Save output
            cv2.imwrite(str(output_path), output_img)
            logger.info(f"Upscaled ROI saved to {output_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to upscale ROI: {e}")
            return False

    def detect_low_confidence_regions(
        self, image_path: str, threshold: float = 0.5
    ) -> list:
        """
        Detect low-confidence regions in an image

        Args:
            image_path: Path to input image
            threshold: Confidence threshold (0-1)

        Returns:
            List of ROIs (x, y, width, height)
        """
        try:
            # Read image
            img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return []

            # Calculate image sharpness (Laplacian variance)
            laplacian = cv2.Laplacian(img, cv2.CV_64F)
            sharpness = laplacian.var()

            logger.info(f"Image sharpness: {sharpness}")

            # If image is blurry, return full image as ROI
            if sharpness < threshold * 100:
                h, w = img.shape
                return [(0, 0, w, h)]

            # Detect blurry regions using sliding window
            window_size = 64
            stride = 32
            rois = []

            for y in range(0, img.shape[0] - window_size, stride):
                for x in range(0, img.shape[1] - window_size, stride):
                    window = img[y : y + window_size, x : x + window_size]
                    window_sharpness = cv2.Laplacian(window, cv2.CV_64F).var()

                    if window_sharpness < threshold * 100:
                        rois.append((x, y, window_size, window_size))

            logger.info(f"Detected {len(rois)} low-confidence regions")
            return rois

        except Exception as e:
            logger.error(f"Failed to detect low-confidence regions: {e}")
            return []

    def batch_upscale(self, input_dir: str, output_dir: str, scale: int = 2) -> int:
        """
        Upscale all images in a directory

        Args:
            input_dir: Input directory
            output_dir: Output directory
            scale: Upscaling factor

        Returns:
            Number of successfully upscaled images
        """
        input_path = Path(input_dir)
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        count = 0
        for img_file in input_path.glob("*.png"):
            output_file = output_path / f"upscaled_{img_file.name}"
            if self.upscale(str(img_file), str(output_file), scale):
                count += 1

        logger.info(f"Upscaled {count} images")
        return count


def main():
    """Test Real-ESRGAN upscaler"""
    upscaler = RealESRGANUpscaler(model_name="RealESRGAN_x2plus", device="cuda")

    # Test upscaling
    test_image = "test_image.png"
    output_image = "upscaled_image.png"

    if os.path.exists(test_image):
        upscaler.upscale(test_image, output_image, scale=2)
        logger.info(f"Upscaled image saved to {output_image}")
    else:
        logger.warning(f"Test image not found: {test_image}")


if __name__ == "__main__":
    main()
