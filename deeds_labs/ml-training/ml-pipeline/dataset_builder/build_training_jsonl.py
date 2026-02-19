#!/usr/bin/env python3
"""
Phase 46: Training Dataset Builder
Creates JSONL training data for Unsloth fine-tuning
"""

import os
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
import argparse
import logging
from dataclasses import dataclass
from jinja2 import Template

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class TrainingExample:
    """Represents a training example for Unsloth"""
    instruction: str
    input_text: str
    output_text: str
    metadata: Dict[str, Any]

class DatasetBuilder:
    """Builds training datasets from clustered code data"""

    def __init__(self):
        self.templates = self._load_templates()

    def _load_templates(self) -> Dict[str, Template]:
        """Load instruction templates for different code types"""
        templates = {
            'function': Template("""
You are an expert {{ language }} developer. Write a {{ language }} function that {{ task_description }}.

Function signature: {{ function_name }}({{ parameters }})
{{ context }}

Provide the complete function implementation:
"""),

            'class': Template("""
You are an expert {{ language }} developer. Design a {{ language }} class for {{ task_description }}.

Class name: {{ class_name }}
{{ context }}

Provide the complete class implementation with methods:
"""),

            'component': Template("""
You are an expert Svelte developer. Create a Svelte component that {{ task_description }}.

Component name: {{ component_name }}
{{ context }}

Provide the complete Svelte component code:
"""),

            'cuda_kernel': Template("""
You are an expert CUDA developer. Write a CUDA kernel that {{ task_description }}.

Kernel name: {{ kernel_name }}
{{ context }}

Provide the complete CUDA kernel implementation:
"""),

            'general': Template("""
You are an expert {{ language }} developer. {{ task_description }}.

{{ context }}

Provide the {{ language }} code implementation:
""")
        }
        return templates

    def load_clustered_data(self, input_file: str) -> List[Dict[str, Any]]:
        """Load clustered data from JSONL file"""
        data = []
        with open(input_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    record = json.loads(line.strip())
                    data.append(record)
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse line: {e}")
                    continue
        logger.info(f"Loaded {len(data)} records from {input_file}")
        return data

    def generate_training_examples(self, data: List[Dict[str, Any]]) -> List[TrainingExample]:
        """Generate training examples from clustered data"""
        examples = []

        for record in data:
            text = record.get('text', '')
            metadata = record.get('metadata', {})

            # Generate examples based on code type
            code_type = metadata.get('type', 'general')
            language = metadata.get('language', 'typescript')

            if code_type == 'function':
                example = self._generate_function_example(text, metadata, language)
            elif code_type == 'class':
                example = self._generate_class_example(text, metadata, language)
            elif code_type == 'component':
                example = self._generate_component_example(text, metadata)
            elif code_type == 'cuda_kernel':
                example = self._generate_cuda_example(text, metadata)
            else:
                example = self._generate_general_example(text, metadata, language)

            if example:
                examples.append(example)

        logger.info(f"Generated {len(examples)} training examples")
        return examples

    def _generate_function_example(self, text: str, metadata: Dict[str, Any], language: str) -> Optional[TrainingExample]:
        """Generate training example for function"""
        function_name = metadata.get('function_name', 'unknown_function')

        # Extract function signature and body
        lines = text.split('\n')
        signature_line = ""
        body_lines = []

        in_function = False
        brace_count = 0

        for line in lines:
            if f"function {function_name}" in line or f"const {function_name}" in line or f"let {function_name}" in line:
                signature_line = line
                in_function = True
                brace_count = line.count('{') - line.count('}')
            elif in_function:
                body_lines.append(line)
                brace_count += line.count('{') - line.count('}')
                if brace_count <= 0:
                    break

        if not signature_line:
            return None

        function_body = '\n'.join(body_lines).strip()

        # Generate instruction
        task_description = self._infer_task_from_function(function_name, function_body, language)

        instruction = self.templates['function'].render(
            language=language,
            task_description=task_description,
            function_name=function_name,
            parameters=self._extract_parameters(signature_line),
            context=f"Context: {metadata.get('filepath', '')}"
        )

        return TrainingExample(
            instruction=instruction.strip(),
            input_text="",
            output_text=function_body,
            metadata={
                'type': 'function',
                'language': language,
                'function_name': function_name,
                'filepath': metadata.get('filepath', '')
            }
        )

    def _generate_class_example(self, text: str, metadata: Dict[str, Any], language: str) -> Optional[TrainingExample]:
        """Generate training example for class"""
        class_name = metadata.get('class_name', 'UnknownClass')

        # Extract class content
        class_content = self._extract_class_content(text, class_name)
        if not class_content:
            return None

        task_description = f"implements a {class_name.lower()} with methods and properties"

        instruction = self.templates['class'].render(
            language=language,
            task_description=task_description,
            class_name=class_name,
            context=f"Context: {metadata.get('filepath', '')}"
        )

        return TrainingExample(
            instruction=instruction.strip(),
            input_text="",
            output_text=class_content,
            metadata={
                'type': 'class',
                'language': language,
                'class_name': class_name,
                'filepath': metadata.get('filepath', '')
            }
        )

    def _generate_component_example(self, text: str, metadata: Dict[str, Any]) -> Optional[TrainingExample]:
        """Generate training example for Svelte component"""
        component_name = metadata.get('component_name', 'UnknownComponent')

        # Extract component content
        component_content = text  # Assume the text is the full component

        task_description = f"creates a reusable {component_name.lower()} component"

        instruction = self.templates['component'].render(
            task_description=task_description,
            component_name=component_name,
            context=f"Context: {metadata.get('filepath', '')}"
        )

        return TrainingExample(
            instruction=instruction.strip(),
            input_text="",
            output_text=component_content,
            metadata={
                'type': 'component',
                'language': 'svelte',
                'component_name': component_name,
                'filepath': metadata.get('filepath', '')
            }
        )

    def _generate_cuda_example(self, text: str, metadata: Dict[str, Any]) -> Optional[TrainingExample]:
        """Generate training example for CUDA kernel"""
        kernel_name = metadata.get('kernel_name', 'unknown_kernel')

        # Extract kernel content
        kernel_content = self._extract_kernel_content(text, kernel_name)
        if not kernel_content:
            return None

        task_description = f"performs parallel computation on GPU"

        instruction = self.templates['cuda_kernel'].render(
            task_description=task_description,
            kernel_name=kernel_name,
            context=f"Context: {metadata.get('filepath', '')}"
        )

        return TrainingExample(
            instruction=instruction.strip(),
            input_text="",
            output_text=kernel_content,
            metadata={
                'type': 'cuda_kernel',
                'language': 'cuda',
                'kernel_name': kernel_name,
                'filepath': metadata.get('filepath', '')
            }
        )

    def _generate_general_example(self, text: str, metadata: Dict[str, Any], language: str) -> Optional[TrainingExample]:
        """Generate general training example"""
        task_description = "implements the following code functionality"

        instruction = self.templates['general'].render(
            language=language,
            task_description=task_description,
            context=f"Context: {metadata.get('filepath', '')}"
        )

        return TrainingExample(
            instruction=instruction.strip(),
            input_text="",
            output_text=text,
            metadata={
                'type': 'general',
                'language': language,
                'filepath': metadata.get('filepath', '')
            }
        )

    def _infer_task_from_function(self, function_name: str, body: str, language: str) -> str:
        """Infer task description from function name and body"""
        name_lower = function_name.lower()

        # Common patterns
        if 'parse' in name_lower:
            return "parses input data and extracts structured information"
        elif 'validate' in name_lower:
            return "validates input data and returns validation results"
        elif 'convert' in name_lower or 'transform' in name_lower:
            return "converts input data from one format to another"
        elif 'calculate' in name_lower or 'compute' in name_lower:
            return "performs mathematical calculations"
        elif 'render' in name_lower:
            return "renders content for display"
        elif 'fetch' in name_lower or 'get' in name_lower:
            return "retrieves data from an external source"
        elif 'handle' in name_lower:
            return "handles events or user interactions"
        else:
            return f"implements {function_name.replace('_', ' ')} functionality"

    def _extract_parameters(self, signature: str) -> str:
        """Extract parameter list from function signature"""
        match = re.search(r'\((.*?)\)', signature)
        if match:
            params = match.group(1).strip()
            if not params:
                return "no parameters"
            return params
        return "parameters"

    def _extract_class_content(self, text: str, class_name: str) -> str:
        """Extract class implementation"""
        # Simple extraction - could be improved
        lines = text.split('\n')
        in_class = False
        brace_count = 0
        class_lines = []

        for line in lines:
            if f"class {class_name}" in line:
                in_class = True
                brace_count = line.count('{') - line.count('}')
                class_lines.append(line)
            elif in_class:
                class_lines.append(line)
                brace_count += line.count('{') - line.count('}')
                if brace_count <= 0:
                    break

        return '\n'.join(class_lines).strip()

    def _extract_kernel_content(self, text: str, kernel_name: str) -> str:
        """Extract CUDA kernel implementation"""
        # Similar to function extraction but for __global__ functions
        lines = text.split('\n')
        in_kernel = False
        brace_count = 0
        kernel_lines = []

        for line in lines:
            if f"__global__ void {kernel_name}" in line:
                in_kernel = True
                brace_count = line.count('{') - line.count('}')
                kernel_lines.append(line)
            elif in_kernel:
                kernel_lines.append(line)
                brace_count += line.count('{') - line.count('}')
                if brace_count <= 0:
                    break

        return '\n'.join(kernel_lines).strip()

    def add_agentic_templates(self, examples: List[TrainingExample]) -> List[TrainingExample]:
        """Add agentic/tool-calling examples"""
        agentic_templates = [
            {
                'instruction': "You are an AI assistant helping with modern web development. The user is working with SvelteKit 2, Svelte 5, bits-ui v2, TypeScript 5.3+, WebGPU, CUDA, and C++. Help them with their question or task.",
                'input_text': "How do I create a reactive form in Svelte 5?",
                'output_text': "In Svelte 5, you can create reactive forms using the new runes system:\n\n```svelte\n<script>\n  let formData = $state({\n    name: '',\n    email: ''\n  });\n\n  function handleSubmit() {\n    console.log('Form submitted:', formData);\n  }\n</script>\n\n<form on:submit|preventDefault={handleSubmit}>\n  <input bind:value={formData.name} placeholder=\"Name\" />\n  <input bind:value={formData.email} type=\"email\" placeholder=\"Email\" />\n  <button type=\"submit\">Submit</button>\n</form>\n```\n\nThe `$state` rune creates reactive state, and `bind:value` automatically syncs the input values with the state object."
            },
            {
                'instruction': "You are an expert in modern web technologies including SvelteKit 2, Svelte 5, bits-ui v2, TypeScript 5.3+, WebGPU, and CUDA. Provide a complete, working code example.",
                'input_text': "Create a WebGPU compute shader for matrix multiplication",
                'output_text': "Here's a complete WebGPU matrix multiplication example:\n\n```typescript\n// Matrix multiplication compute shader\nconst computeShader = `\n@group(0) @binding(0) var<storage, read> matrixA: array<f32>;\n@group(0) @binding(1) var<storage, read> matrixB: array<f32>;\n@group(0) @binding(2) var<storage, read_write> result: array<f32>;\n\n@compute @workgroup_size(8, 8)\nfn main(@builtin(global_invocation_id) global_id: vec3<u32>) {\n  let row = global_id.x;\n  let col = global_id.y;\n  let size = 1024u;\n  \n  var sum = 0.0;\n  for (var i = 0u; i < size; i = i + 1u) {\n    sum = sum + matrixA[row * size + i] * matrixB[i * size + col];\n  }\n  result[row * size + col] = sum;\n}\n`;\n\n// Usage in TypeScript\nconst device = await navigator.gpu.requestAdapter().then(a => a.requestDevice());\n// ... buffer creation and pipeline setup\n```"
            }
        ]

        for template in agentic_templates:
            example = TrainingExample(
                instruction=template['instruction'],
                input_text=template['input_text'],
                output_text=template['output_text'],
                metadata={'type': 'agentic', 'source': 'template'}
            )
            examples.append(example)

        logger.info(f"Added {len(agentic_templates)} agentic examples")
        return examples

    def save_dataset(self, examples: List[TrainingExample], output_file: str):
        """Save training examples to JSONL file"""
        logger.info(f"Saving {len(examples)} examples to {output_file}")

        with open(output_file, 'w', encoding='utf-8') as f:
            for example in examples:
                record = {
                    'instruction': example.instruction,
                    'input': example.input_text,
                    'output': example.output_text,
                    'metadata': example.metadata
                }
                json.dump(record, f, ensure_ascii=False)
                f.write('\n')

        logger.info(f"Dataset saved to {output_file}")

    def build_dataset(self, input_file: str, output_file: str, include_agentic: bool = True):
        """Build complete training dataset"""
        logger.info("Building training dataset...")

        # Load clustered data
        data = self.load_clustered_data(input_file)

        # Generate examples
        examples = self.generate_training_examples(data)

        # Add agentic examples
        if include_agentic:
            examples = self.add_agentic_templates(examples)

        # Save dataset
        self.save_dataset(examples, output_file)

        logger.info("Dataset building complete!")

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description="Build Unsloth training dataset")
    parser.add_argument("input_file", help="Input clustered data JSONL file")
    parser.add_argument("output_file", help="Output training dataset JSONL file")
    parser.add_argument("--no-agentic", action="store_true", help="Skip agentic examples")

    args = parser.parse_args()

    builder = DatasetBuilder()
    builder.build_dataset(args.input_file, args.output_file, not args.no_agentic)

if __name__ == "__main__":
    main()