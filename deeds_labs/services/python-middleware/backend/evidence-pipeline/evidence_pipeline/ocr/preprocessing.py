"""
Image preprocessing for OCR optimization.
Handles image enhancement, normalization, and format conversion.
"""

import logging
from typing import Optional, Tuple
import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

logger = logging.getLogger(__name__)


class ImagePreprocessor:
    """Preprocesses images for optimal OCR performance."""

    def __init__(self):
        """Initialize image preprocessor."""
        self.target_dpi = 300  # Optimal DPI for OCR
        self.min_width = 100
        self.max_width = 4000

    def preprocess_for_ocr(
        self,
        image: Image.Image,
        enhance_contrast: bool = True,
        denoise: bool = True,
        deskew: bool = True,
        threshold: bool = True
    ) -> Image.Image:
        """
        Preprocess image for OCR.

        Args:
            image: PIL Image object
            enhance_contrast: Apply contrast enhancement
            denoise: Apply denoising
            deskew: Apply deskewing
            threshold: Apply thresholding

        Returns:
            Preprocessed PIL Image
        """
        try:
            logger.info("Starting image preprocessing for OCR")

            # Convert to RGB if needed
            if image.mode != 'RGB':
                image = image.convert('RGB')

            # Resize if needed
            image = self._resize_image(image)

            # Convert to numpy array for OpenCV operations
            img_array = np.array(image)

            # Convert to grayscale
            if len(img_array.shape) == 3:
                img_array = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

            # Apply preprocessing steps
            if denoise:
                img_array = self._denoise(img_array)

            if enhance_contrast:
                img_array = self._enhance_contrast(img_array)

            if deskew:
                img_array = self._deskew(img_array)

            if threshold:
                img_array = self._threshold(img_array)

            # Convert back to PIL Image
            result = Image.fromarray(img_array)

            logger.info("Image preprocessing completed successfully")
            return result

        except Exception as e:
            logger.error(f"Image preprocessing failed: {e}")
            return image

    def _resize_image(self, image: Image.Image) -> Image.Image:
        """
        Resize image to optimal dimensions for OCR.

        Args:
            image: PIL Image object

        Returns:
            Resized PIL Image
        """
        try:
            width, height = image.size

            # Check if resizing is needed
            if self.min_width <= width <= self.max_width:
                return image

            # Calculate new dimensions
            if width < self.min_width:
                scale = self.min_width / width
            else:
                scale = self.max_width / width

            new_width = int(width * scale)
            new_height = int(height * scale)

            logger.info(f"Resizing image from {width}x{height} to {new_width}x{new_height}")

            # Use high-quality resampling
            return image.resize((new_width, new_height), Image.Resampling.LANCZOS)

        except Exception as e:
            logger.warning(f"Image resizing failed: {e}")
            return image

    def _denoise(self, image_array: np.ndarray) -> np.ndarray:
        """
        Denoise image using bilateral filtering.

        Args:
            image_array: Numpy array of grayscale image

        Returns:
            Denoised image array
        """
        try:
            logger.debug("Applying denoising")

            # Apply bilateral filter (preserves edges while removing noise)
            denoised = cv2.bilateralFilter(image_array, 9, 75, 75)

            return denoised

        except Exception as e:
            logger.warning(f"Denoising failed: {e}")
            return image_array

    def _enhance_contrast(self, image_array: np.ndarray) -> np.ndarray:
        """
        Enhance image contrast using CLAHE.

        Args:
            image_array: Numpy array of grayscale image

        Returns:
            Contrast-enhanced image array
        """
        try:
            logger.debug("Enhancing contrast")

            # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(image_array)

            return enhanced

        except Exception as e:
            logger.warning(f"Contrast enhancement failed: {e}")
            return image_array

    def _deskew(self, image_array: np.ndarray) -> np.ndarray:
        """
        Deskew image using Hough transform.

        Args:
            image_array: Numpy array of grayscale image

        Returns:
            Deskewed image array
        """
        try:
            logger.debug("Deskewing image")

            # Detect edges
            edges = cv2.Canny(image_array, 50, 150)

            # Detect lines using Hough transform
            lines = cv2.HoughLines(edges, 1, np.pi / 180, 100)

            if lines is None or len(lines) == 0:
                logger.debug("No lines detected for deskewing")
                return image_array

            # Calculate average angle
            angles = []
            for line in lines:
                rho, theta = line[0]
                angle = np.degrees(theta) - 90
                if -45 <= angle <= 45:  # Only consider reasonable angles
                    angles.append(angle)

            if not angles:
                return image_array

            avg_angle = np.median(angles)

            logger.debug(f"Detected skew angle: {avg_angle:.2f} degrees")

            # Rotate image
            h, w = image_array.shape
            center = (w // 2, h // 2)
            rotation_matrix = cv2.getRotationMatrix2D(center, avg_angle, 1.0)
            rotated = cv2.warpAffine(
                image_array,
                rotation_matrix,
                (w, h),
                borderMode=cv2.BORDER_REPLICATE
            )

            return rotated

        except Exception as e:
            logger.warning(f"Deskewing failed: {e}")
            return image_array

    def _threshold(self, image_array: np.ndarray) -> np.ndarray:
        """
        Apply adaptive thresholding to image.

        Args:
            image_array: Numpy array of grayscale image

        Returns:
            Thresholded image array
        """
        try:
            logger.debug("Applying thresholding")

            # Apply adaptive thresholding
            thresholded = cv2.adaptiveThreshold(
                image_array,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                11,
                2
            )

            return thresholded

        except Exception as e:
            logger.warning(f"Thresholding failed: {e}")
            return image_array

    def convert_pdf_to_images(
        self,
        pdf_path: str,
        dpi: int = 300
    ) -> list:
        """
        Convert PDF to images.

        Args:
            pdf_path: Path to PDF file
            dpi: DPI for conversion

        Returns:
            List of PIL Image objects
        """
        try:
            import pdf2image

            logger.info(f"Converting PDF to images: {pdf_path}")

            images = pdf2image.convert_from_path(pdf_path, dpi=dpi)

            logger.info(f"Converted PDF to {len(images)} images")
            return images

        except ImportError:
            logger.error("pdf2image not installed")
            raise
        except Exception as e:
            logger.error(f"PDF conversion failed: {e}")
            raise

    def get_image_quality_score(self, image_array: np.ndarray) -> float:
        """
        Calculate image quality score (0-1).

        Args:
            image_array: Numpy array of grayscale image

        Returns:
            Quality score (0-1)
        """
        try:
            # Calculate Laplacian variance (measure of sharpness)
            laplacian_var = cv2.Laplacian(image_array, cv2.CV_64F).var()

            # Normalize to 0-1 range
            # Typical values: 100-1000 for good quality
            quality_score = min(1.0, laplacian_var / 1000.0)

            return quality_score

        except Exception as e:
            logger.warning(f"Quality score calculation failed: {e}")
            return 0.5

    def get_image_brightness(self, image_array: np.ndarray) -> float:
        """
        Calculate average image brightness (0-1).

        Args:
            image_array: Numpy array of grayscale image

        Returns:
            Brightness score (0-1)
        """
        try:
            brightness = np.mean(image_array) / 255.0
            return brightness

        except Exception as e:
            logger.warning(f"Brightness calculation failed: {e}")
            return 0.5

    def get_image_contrast(self, image_array: np.ndarray) -> float:
        """
        Calculate image contrast (0-1).

        Args:
            image_array: Numpy array of grayscale image

        Returns:
            Contrast score (0-1)
        """
        try:
            contrast = np.std(image_array) / 128.0
            return min(1.0, contrast)

        except Exception as e:
            logger.warning(f"Contrast calculation failed: {e}")
            return 0.5
