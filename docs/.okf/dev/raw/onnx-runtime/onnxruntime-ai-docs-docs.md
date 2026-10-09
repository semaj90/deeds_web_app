[Skip to main content](https://onnxruntime.ai/docs/#main-content)LinkMenuExpand(external link)DocumentSearchCopyCopied

Search onnxruntime

# Welcome to ONNX Runtime

ONNX Runtime is a cross-platform machine-learning model accelerator, with a flexible interface to integrate hardware-specific libraries. ONNX Runtime can be used with models from PyTorch, Tensorflow/Keras, TFLite, scikit-learn, and other frameworks.

v1.14 ONNX Runtime - Release Review - YouTube

Tap to unmute

[v1.14 ONNX Runtime - Release Review](https://www.youtube.com/watch?v=waIeC3OIn70) [ONNX Runtime](https://www.youtube.com/channel/UC_SJk17KdRvDulXz-nc1uFg)

ONNX Runtime3.85K subscribers

## How to use ONNX Runtime

|     |     |
| --- | --- |
| [Get started with ORT](https://onnxruntime.ai/docs/get-started) | [API Docs](https://onnxruntime.ai/docs/api) |
| [Tutorials](https://onnxruntime.ai/docs/tutorials) | [Ecosystem](https://onnxruntime.ai/docs/ecosystem) |
| [ONNX Runtime YouTube](https://www.youtube.com/channel/UC_SJk17KdRvDulXz-nc1uFg/featured) |  |

## Contribute and Customize

|     |     |
| --- | --- |
| [Build ORT Packages](https://onnxruntime.ai/docs/build) | [ONNX Runtime GitHub](https://github.com/microsoft/onnxruntime) |

* * *

## QuickStart Template

|     |     |
| --- | --- |
| [ORT Web JavaScript Site Template](https://github.com/microsoft/onnxruntime-nextjs-template) | [ORT C# Console App Template](https://github.com/microsoft/onnxruntime-csharp-cv-template) |

* * *

## ONNX Runtime for Inferencing

ONNX Runtime Inference powers machine learning models in key Microsoft products and services across Office, Azure, Bing, as well as dozens of community projects.

Examples use cases for ONNX Runtime Inferencing include:

- Improve inference performance for a wide variety of ML models
- Run on different hardware and operating systems
- Train in Python but deploy into a C#/C++/Java app
- Train and perform inference with models created in different frameworks

### How it works

The premise is simple.

1. **Get a model.** This can be trained from any framework that supports export/conversion to ONNX format. See the [tutorials](https://onnxruntime.ai/docs/tutorials) for some of the popular frameworks/libraries.
2. **Load and run the model with ONNX Runtime.** See the [basic tutorials](https://onnxruntime.ai/docs/tutorials/api-basics) for running models in different languages.
3. **_(Optional)_ Tune performance using various runtime configurations or hardware accelerators.** There are lots of options here - see the [Performance section](https://onnxruntime.ai/docs/performance) as a starting point.

Even without step 3, ONNX Runtime will often provide performance improvements compared to the original framework.

ONNX Runtime applies a number of graph optimizations on the model graph then partitions it into subgraphs based on available hardware-specific accelerators. Optimized computation kernels in core ONNX Runtime provide performance improvements and assigned subgraphs benefit from further acceleration from each [Execution Provider](https://onnxruntime.ai/docs/execution-providers).

### Model Validation

You are responsible for testing and validating any model you use with ONNX Runtime, including its accuracy, performance, and suitability for your intended use case. ONNX Runtime will validate that the model conforms to the [ONNX](https://onnx.ai/onnx/index.html) specification. It is, however, possible to construct a malicious model that, for example, consumes large amounts of memory or compute resources unnecessarily. If you are using a model from an untrusted source, we recommend inspecting the model and testing it in a safe environment before using it in production.

* * *

## ONNX Runtime for Training

- [Large Model Training](https://onnxruntime.ai/docs/get-started/training-pytorch.html)
- [On-Device Training](https://onnxruntime.ai/docs/get-started/training-on-device.html)

* * *