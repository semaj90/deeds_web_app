#include <napi.h>
#include <simdjson.h>
#include <memory>
#include <string>
#include <vector>

class SIMDJSONWorker : public Napi::AsyncWorker {
public:
  SIMDJSONWorker(Napi::Function& callback, std::string&& json_str)
      : Napi::AsyncWorker(callback), json_str_(std::move(json_str)) {}

  void Execute() override {
    try {
      // Initialize SIMDJSON parser with padding for SIMD operations
      simdjson::dom::parser parser;

      // Parse the JSON string
      auto result = parser.parse(json_str_);

      if (result.error() != simdjson::SUCCESS) {
        SetError(std::string("SIMDJSON parse error: ") + simdjson::error_message(result.error()));
        return;
      }

      // Convert to string representation for Node.js
      std::stringstream ss;
      simdjson::dom::element element;
      auto error = result.get(element);
      if (error != simdjson::SUCCESS) {
        SetError(std::string("Failed to get element from result: ") + simdjson::error_message(error));
        return;
      }
      ss << element;
      parsed_json_ = ss.str();

    } catch (const std::exception& e) {
      SetError(std::string("Exception during parsing: ") + e.what());
    }
  }

  void OnOK() override {
    Napi::HandleScope scope(Env());

    // Create the result object
    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), true));
    result.Set("data", Napi::String::New(Env(), parsed_json_));
    result.Set("performance", Napi::String::New(Env(), "SIMD accelerated"));

    Callback().Call({result});
  }

  void OnError(const Napi::Error& error) override {
    Napi::HandleScope scope(Env());

    Napi::Object result = Napi::Object::New(Env());
    result.Set("success", Napi::Boolean::New(Env(), false));
    result.Set("error", Napi::String::New(Env(), error.Message()));

    Callback().Call({result});
  }

private:
  std::string json_str_;
  std::string parsed_json_;
};

// Synchronous parse function
Napi::Value ParseSync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string json_str = info[0].As<Napi::String>().Utf8Value();

  try {
    simdjson::dom::parser parser;
    auto result = parser.parse(json_str);

    if (result.error() != simdjson::SUCCESS) {
      Napi::Error::New(env, std::string("SIMDJSON parse error: ") + simdjson::error_message(result.error()))
          .ThrowAsJavaScriptException();
      return env.Null();
    }

    // Convert parsed document to string
    std::stringstream ss;
    simdjson::dom::element element;
    auto error = result.get(element);
    if (error != simdjson::SUCCESS) {
      Napi::Error::New(env, std::string("Failed to get element from result: ") + simdjson::error_message(error))
          .ThrowAsJavaScriptException();
      return env.Null();
    }
    ss << element;

    Napi::Object response = Napi::Object::New(env);
    response.Set("success", Napi::Boolean::New(env, true));
    response.Set("data", Napi::String::New(env, ss.str()));
    response.Set("performance", Napi::String::New(env, "SIMD accelerated"));

    return response;

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Exception: ") + e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Asynchronous parse function
Napi::Value ParseAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "String and callback function expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string json_str = info[0].As<Napi::String>().Utf8Value();
  Napi::Function callback = info[1].As<Napi::Function>();

  SIMDJSONWorker* worker = new SIMDJSONWorker(callback, std::move(json_str));
  worker->Queue();

  return env.Undefined();
}

// Validation function
Napi::Value Validate(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string json_str = info[0].As<Napi::String>().Utf8Value();

  try {
    simdjson::dom::parser parser;
    auto result = parser.parse(json_str);

    Napi::Object response = Napi::Object::New(env);
    response.Set("valid", Napi::Boolean::New(env, result.error() == simdjson::SUCCESS));

    if (result.error() != simdjson::SUCCESS) {
      response.Set("error", Napi::String::New(env, simdjson::error_message(result.error())));
    }

    return response;

  } catch (const std::exception& e) {
    Napi::Object response = Napi::Object::New(env);
    response.Set("valid", Napi::Boolean::New(env, false));
    response.Set("error", Napi::String::New(env, std::string("Exception: ") + e.what()));
    return response;
  }
}

// Performance benchmark function
Napi::Value Benchmark(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "String and iteration count expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string json_str = info[0].As<Napi::String>().Utf8Value();
  int iterations = info[1].As<Napi::Number>().Int32Value();

  if (iterations <= 0) iterations = 1;
  if (iterations > 10000) iterations = 10000; // Safety limit

  try {
    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < iterations; ++i) {
      simdjson::dom::parser parser;
      auto result = parser.parse(json_str);
      if (result.error() != simdjson::SUCCESS) {
        Napi::Error::New(env, "Benchmark failed: invalid JSON").ThrowAsJavaScriptException();
        return env.Null();
      }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    Napi::Object response = Napi::Object::New(env);
    response.Set("iterations", Napi::Number::New(env, iterations));
    response.Set("totalTimeMicroseconds", Napi::Number::New(env, duration.count()));
    response.Set("averageTimeMicroseconds", Napi::Number::New(env, duration.count() / iterations));
    response.Set("throughputMBps", Napi::Number::New(env, (json_str.size() * iterations * 1000000.0) / (duration.count() * 1024 * 1024)));

    return response;

  } catch (const std::exception& e) {
    Napi::Error::New(env, std::string("Benchmark exception: ") + e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Initialize the module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("parseSync", Napi::Function::New(env, ParseSync));
  exports.Set("parseAsync", Napi::Function::New(env, ParseAsync));
  exports.Set("validate", Napi::Function::New(env, Validate));
  exports.Set("benchmark", Napi::Function::New(env, Benchmark));

  // Version info
  exports.Set("version", Napi::String::New(env, "1.0.0"));
  exports.Set("simdjsonVersion", Napi::String::New(env, "3.6.3"));
  exports.Set("description", Napi::String::New(env, "SIMD-accelerated JSON parsing for Node.js"));

  return exports;
}

NODE_API_MODULE(simdjson, Init)