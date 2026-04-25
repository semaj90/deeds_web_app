#!/usr/bin/env python3
"""
Granite-Docling Parser (258M VLM)
Primary document parser for OCR + layout preservation + table extraction
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import torch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GraniteDoclingParser:
    """Granite-Docling parser for document processing"""

    def __init__(self, device: str = "cuda", model_name: str = "granite-docling-258m"):
        """
        Initialize Granite-Docling parser

        Args:
            device: Device to use (cuda, cpu)
            model_name: Model name
        """
        self.device = device
        self.model_name = model_name
        self.model = None
        self.processor = None

        try:
            self._load_model()
        except Exception as e:
            logger.error(f"Failed to load Granite-Docling model: {e}")
            self.model = None

    def _load_model(self):
        """Load Granite-Docling model"""
        try:
            from transformers import Idefics3ForConditionalGeneration, AutoProcessor

            logger.info(f"Loading {self.model_name} model...")

            # Load model and processor
            self.processor = AutoProcessor.from_pretrained(
                "ibm-granite/granite-docling-258m",
                trust_remote_code=True,
            )

            self.model = Idefics3ForConditionalGeneration.from_pretrained(
                "ibm-granite/granite-docling-258m",
                device_map="auto" if self.device == "cuda" else None,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                trust_remote_code=True,
            )

            # Move to device if no device_map
            if self.device != "cuda":
                self.model = self.model.to(self.device)

            logger.info(f"Loaded {self.model_name} model successfully")

        except ImportError:
            logger.warning("Transformers not installed, using fallback parser")
            self.model = None
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.model = None

    def parse_document(self, image_path: str) -> Dict:
        """
        Parse document with Granite-Docling

        Args:
            image_path: Path to document image

        Returns:
            Dictionary with parsed content
        """
        try:
            if not self.model:
                logger.warning("Model not loaded, using fallback parsing")
                return self._fallback_parse(image_path)

            from PIL import Image

            # Load image
            image = Image.open(image_path).convert("RGB")

            # Prepare inputs
            # Use the correct instruction for granite-docling model with image placeholder
            prompts = "<image>Convert this page to docling."
            inputs = self.processor(text=prompts, images=image, return_tensors="pt").to(self.device)

            # Debug logging
            logger.info(f"Input keys: {list(inputs.keys())}")
            if 'pixel_values' in inputs:
                logger.info(f"Pixel values shape: {inputs['pixel_values'].shape}")

            # Filter inputs for generate (remove rows/cols if present as they cause issues with Idefics3)
            generate_inputs = {k: v for k, v in inputs.items() if k not in ['rows', 'cols']}

            # Ensure input_ids and attention_mask exist
            if 'input_ids' not in generate_inputs:
                logger.info("Adding default input_ids (BOS) and attention_mask")
                bos_token_id = self.processor.tokenizer.bos_token_id
                batch_size = generate_inputs['pixel_values'].shape[0]
                generate_inputs['input_ids'] = torch.full(
                    (batch_size, 1),
                    bos_token_id,
                    dtype=torch.long,
                    device=self.device
                )
                generate_inputs['attention_mask'] = torch.ones(
                    (batch_size, 1),
                    dtype=torch.long,
                    device=self.device
                )

            # Generate output
            with torch.no_grad():
                output = self.model.generate(
                    **generate_inputs,
                    max_new_tokens=4096,
                    do_sample=False,
                )

            logger.info(f"Output tokens: {output[0].tolist()[:20]}...")

            # Decode output
            parsed_text = self.processor.decode(output[0], skip_special_tokens=True)

            logger.info(f"Extracted text length: {len(parsed_text)}")
            if len(parsed_text) > 0:
                logger.info(f"Extracted text preview: {parsed_text[:100]}...")
            else:
                logger.warning("Extracted text is empty!")

            # Extract DocTags format
            doc_tags = self._extract_doc_tags(parsed_text)

            return {
                "success": True,
                "text": parsed_text,
                "doc_tags": doc_tags,
                "metadata": {
                    "parser": "granite-docling",
                    "model": self.model_name,
                    "device": self.device,
                },
            }

        except Exception as e:
            logger.error(f"Failed to parse document: {e}")
            return {
                "success": False,
                "error": str(e),
                "metadata": {"parser": "granite-docling"},
            }

    def parse_batch(self, image_paths: List[str]) -> List[Dict]:
        """
        Parse multiple documents

        Args:
            image_paths: List of image paths

        Returns:
            List of parsed documents
        """
        results = []
        for i, image_path in enumerate(image_paths):
            logger.info(f"Parsing document {i+1}/{len(image_paths)}: {image_path}")
            result = self.parse_document(image_path)
            results.append(result)

        return results

    def extract_tables(self, parsed_content: Dict) -> List[Dict]:
        """
        Extract tables from parsed content

        Args:
            parsed_content: Parsed document content

        Returns:
            List of extracted tables
        """
        try:
            tables = []

            # Parse DocTags to find table markers
            doc_tags = parsed_content.get("doc_tags", {})

            for tag_name, tag_content in doc_tags.items():
                if "table" in tag_name.lower():
                    tables.append({
                        "name": tag_name,
                        "content": tag_content,
                        "type": "table",
                    })

            logger.info(f"Extracted {len(tables)} tables")
            return tables

        except Exception as e:
            logger.error(f"Failed to extract tables: {e}")
            return []

    def extract_text(self, parsed_content: Dict) -> str:
        """
        Extract text from parsed content

        Args:
            parsed_content: Parsed document content

        Returns:
            Extracted text
        """
        return parsed_content.get("text", "")

    def extract_layout(self, parsed_content: Dict) -> Dict:
        """
        Extract layout information from parsed content

        Args:
            parsed_content: Parsed document content

        Returns:
            Layout information
        """
        try:
            doc_tags = parsed_content.get("doc_tags", {})

            layout = {
                "sections": [],
                "tables": [],
                "figures": [],
                "text_blocks": [],
            }

            for tag_name, tag_content in doc_tags.items():
                if "section" in tag_name.lower():
                    layout["sections"].append({"name": tag_name, "content": tag_content})
                elif "table" in tag_name.lower():
                    layout["tables"].append({"name": tag_name, "content": tag_content})
                elif "figure" in tag_name.lower():
                    layout["figures"].append({"name": tag_name, "content": tag_content})
                else:
                    layout["text_blocks"].append({"name": tag_name, "content": tag_content})

            return layout

        except Exception as e:
            logger.error(f"Failed to extract layout: {e}")
            return {}

    def _extract_doc_tags(self, text: str) -> Dict:
        """
        Extract DocTags format from parsed text

        Args:
            text: Parsed text

        Returns:
            Dictionary of DocTags
        """
        try:
            # Parse DocTags format (simplified)
            doc_tags = {}

            # Look for <tag>content</tag> patterns
            import re

            pattern = r"<(\w+)>(.*?)</\1>"
            matches = re.findall(pattern, text, re.DOTALL)

            for tag_name, tag_content in matches:
                doc_tags[tag_name] = tag_content.strip()

            return doc_tags

        except Exception as e:
            logger.error(f"Failed to extract DocTags: {e}")
            return {}

    def _fallback_parse(self, image_path: str) -> Dict:
        """
        Fallback parsing using OCR

        Args:
            image_path: Path to document image

        Returns:
            Dictionary with parsed content
        """
        try:
            import pytesseract
            from PIL import Image

            image = Image.open(image_path)
            text = pytesseract.image_to_string(image)

            return {
                "success": True,
                "text": text,
                "doc_tags": {},
                "metadata": {
                    "parser": "tesseract-fallback",
                    "fallback": True,
                },
            }

        except Exception as e:
            logger.error(f"Fallback parsing failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "metadata": {"parser": "fallback"},
            }

    def get_model_info(self) -> Dict:
        """Get model information"""
        return {
            "model_name": self.model_name,
            "device": self.device,
            "parameters": "258M",
            "architecture": "Vision Language Model",
            "capabilities": [
                "OCR",
                "Layout Preservation",
                "Table Recognition",
                "Math Handling",
                "Code Recognition",
            ],
        }


def main():
    """Test Granite-Docling parser"""
    parser = GraniteDoclingParser(device="cuda")

    # Print model info
    logger.info(f"Model info: {parser.get_model_info()}")

    # Test parsing
    test_image = "test_image.png"

    if os.path.exists(test_image):
        result = parser.parse_document(test_image)
        logger.info(f"Parse result: {result}")

        if result.get("success"):
            # Extract tables
            tables = parser.extract_tables(result)
            logger.info(f"Extracted {len(tables)} tables")

            # Extract layout
            layout = parser.extract_layout(result)
            logger.info(f"Layout: {layout}")
    else:
        logger.warning(f"Test image not found: {test_image}")


if __name__ == "__main__":
    main()
