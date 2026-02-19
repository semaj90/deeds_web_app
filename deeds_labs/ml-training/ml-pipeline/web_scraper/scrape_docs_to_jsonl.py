#!/usr/bin/env python3
"""
Phase 46: Web Scraper for Training Data
Scrapes documentation and examples from web sources for training data
"""

import os
import json
import re
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
import argparse
import logging
from urllib.parse import urljoin, urlparse
from dataclasses import dataclass

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ScrapedContent:
    """Represents scraped web content"""
    url: str
    title: str
    content: str
    code_blocks: List[str]
    metadata: Dict[str, Any]

class WebScraper:
    """Scrapes web content for training data"""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        # Target URLs for scraping
        self.target_urls = [
            # Svelte documentation
            'https://svelte.dev/docs',
            'https://svelte.dev/tutorial',
            'https://kit.svelte.dev/docs',

            # TypeScript documentation
            'https://www.typescriptlang.org/docs/',
            'https://www.typescriptlang.org/docs/handbook',

            # WebGPU
            'https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API',
            'https://gpuweb.github.io/gpuweb/',

            # CUDA documentation
            'https://docs.nvidia.com/cuda/cuda-c-programming-guide/',
            'https://docs.nvidia.com/cuda/cuda-runtime-api/',

            # bits-ui documentation
            'https://www.bits-ui.com/',

            # GitHub repositories
            'https://github.com/sveltejs/svelte',
            'https://github.com/sveltejs/kit',
            'https://github.com/huntabyte/bits-ui'
        ]

    def setup_selenium(self) -> webdriver.Chrome:
        """Setup Selenium WebDriver"""
        options = Options()
        if self.headless:
            options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')

        driver = webdriver.Chrome(options=options)
        return driver

    def scrape_url(self, url: str) -> Optional[ScrapedContent]:
        """Scrape a single URL"""
        try:
            logger.info(f"Scraping: {url}")

            # Try requests first for static content
            response = self.session.get(url, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Extract title
            title = soup.title.string if soup.title else url

            # Extract main content
            content = self._extract_main_content(soup)

            # Extract code blocks
            code_blocks = self._extract_code_blocks(soup)

            # Create metadata
            metadata = {
                'source': 'web_scrape',
                'url': url,
                'domain': urlparse(url).netloc,
                'scraped_at': time.time(),
                'content_type': self._classify_content(url, content)
            }

            return ScrapedContent(
                url=url,
                title=title,
                content=content,
                code_blocks=code_blocks,
                metadata=metadata
            )

        except Exception as e:
            logger.warning(f"Failed to scrape {url}: {e}")
            return None

    def scrape_with_selenium(self, url: str) -> Optional[ScrapedContent]:
        """Scrape URL using Selenium for dynamic content"""
        driver = None
        try:
            driver = self.setup_selenium()
            driver.get(url)

            # Wait for content to load
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "body"))
            )

            # Get page source
            soup = BeautifulSoup(driver.page_source, 'html.parser')

            # Extract content similar to requests method
            title = driver.title or url
            content = self._extract_main_content(soup)
            code_blocks = self._extract_code_blocks(soup)

            metadata = {
                'source': 'selenium_scrape',
                'url': url,
                'domain': urlparse(url).netloc,
                'scraped_at': time.time(),
                'content_type': self._classify_content(url, content)
            }

            return ScrapedContent(
                url=url,
                title=title,
                content=content,
                code_blocks=code_blocks,
                metadata=metadata
            )

        except Exception as e:
            logger.warning(f"Failed to scrape with Selenium {url}: {e}")
            return None
        finally:
            if driver:
                driver.quit()

    def _extract_main_content(self, soup: BeautifulSoup) -> str:
        """Extract main content from HTML"""
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()

        # Try common content selectors
        content_selectors = [
            'main',
            '.content',
            '.main-content',
            'article',
            '.documentation',
            '.doc-content',
            '#content',
            '.container'
        ]

        content = ""
        for selector in content_selectors:
            element = soup.select_one(selector)
            if element:
                content = element.get_text(separator='\n', strip=True)
                if len(content) > 200:  # Minimum content length
                    break

        # Fallback to body text
        if not content:
            body = soup.find('body')
            if body:
                content = body.get_text(separator='\n', strip=True)

        return content

    def _extract_code_blocks(self, soup: BeautifulSoup) -> List[str]:
        """Extract code blocks from HTML"""
        code_blocks = []

        # Find all code elements
        code_elements = soup.find_all(['code', 'pre'])

        for element in code_elements:
            code_text = element.get_text(strip=True)
            if code_text and len(code_text) > 10:  # Filter out short snippets
                code_blocks.append(code_text)

        return code_blocks

    def _classify_content(self, url: str, content: str) -> str:
        """Classify the type of content"""
        url_lower = url.lower()
        content_lower = content.lower()

        if 'svelte' in url_lower:
            if 'tutorial' in url_lower:
                return 'svelte_tutorial'
            elif 'docs' in url_lower:
                return 'svelte_docs'
            else:
                return 'svelte_general'
        elif 'typescript' in url_lower:
            return 'typescript_docs'
        elif 'webgpu' in url_lower or 'gpu' in url_lower:
            return 'webgpu_docs'
        elif 'cuda' in url_lower:
            return 'cuda_docs'
        elif 'bits-ui' in url_lower:
            return 'bits_ui_docs'
        elif 'github.com' in url_lower:
            return 'github_repo'
        else:
            return 'general_docs'

    def generate_training_examples(self, scraped: ScrapedContent) -> List[Dict[str, Any]]:
        """Generate training examples from scraped content"""
        examples = []

        # Example from main content
        if scraped.content:
            instruction = f"You are an expert in {scraped.metadata['content_type'].replace('_', ' ')}. Answer the following question about {scraped.title}:"

            example = {
                'instruction': instruction,
                'input': f"What is covered in the documentation for '{scraped.title}'?",
                'output': scraped.content[:2000],  # Truncate for training
                'metadata': {
                    'source': 'web_scrape',
                    'url': scraped.url,
                    'content_type': scraped.metadata['content_type']
                }
            }
            examples.append(example)

        # Examples from code blocks
        for i, code_block in enumerate(scraped.code_blocks[:5]):  # Limit to 5 per page
            language = self._detect_language(code_block)

            instruction = f"You are an expert {language} developer. Provide a code example for:"

            example = {
                'instruction': instruction,
                'input': f"Show me a {language} code example similar to: {code_block[:100]}...",
                'output': code_block,
                'metadata': {
                    'source': 'web_scrape',
                    'url': scraped.url,
                    'language': language,
                    'content_type': 'code_example'
                }
            }
            examples.append(example)

        return examples

    def _detect_language(self, code: str) -> str:
        """Detect programming language from code"""
        code_lower = code.lower()

        if 'import ' in code and ('from ' in code or 'export ' in code):
            if '<script' in code_lower or 'svelte' in code_lower:
                return 'svelte'
            else:
                return 'typescript'
        elif '__global__' in code or 'cuda' in code_lower:
            return 'cuda'
        elif 'fn main' in code or 'println!' in code:
            return 'rust'
        elif 'def ' in code and 'import ' in code:
            return 'python'
        elif '#include' in code or 'int main' in code:
            return 'cpp'
        else:
            return 'typescript'  # Default

    def scrape_all_targets(self) -> List[ScrapedContent]:
        """Scrape all target URLs"""
        scraped_content = []

        for url in self.target_urls:
            content = self.scrape_url(url)
            if content:
                scraped_content.append(content)

            # Be respectful to servers
            time.sleep(2)

        logger.info(f"Scraped {len(scraped_content)} pages")
        return scraped_content

    def save_to_jsonl(self, examples: List[Dict[str, Any]], output_file: str):
        """Save training examples to JSONL"""
        logger.info(f"Saving {len(examples)} examples to {output_file}")

        with open(output_file, 'w', encoding='utf-8') as f:
            for example in examples:
                json.dump(example, f, ensure_ascii=False)
                f.write('\n')

        logger.info("Web scraping data saved")

    def run_scraping_pipeline(self, output_file: str):
        """Run complete scraping pipeline"""
        logger.info("Starting web scraping pipeline...")

        # Scrape all targets
        scraped_content = self.scrape_all_targets()

        # Generate training examples
        all_examples = []
        for content in scraped_content:
            examples = self.generate_training_examples(content)
            all_examples.extend(examples)

        # Save to JSONL
        self.save_to_jsonl(all_examples, output_file)

        logger.info("Web scraping pipeline complete!")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Scrape web content for training data")
    parser.add_argument("output_file", help="Output JSONL file for training data")
    parser.add_argument("--headless", action="store_true", default=True, help="Run browser in headless mode")
    parser.add_argument("--urls", nargs="+", help="Specific URLs to scrape instead of defaults")

    args = parser.parse_args()

    scraper = WebScraper(headless=args.headless)

    if args.urls:
        scraper.target_urls = args.urls

    scraper.run_scraping_pipeline(args.output_file)

if __name__ == "__main__":
    main()