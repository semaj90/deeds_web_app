{
  "targets": [
    {
      "target_name": "simdjson",
      "sources": [
        "src/native/simdjson-addon/simdjson.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src/native/simdjson-addon/simdjson/include"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "SIMDJSON_EXCEPTIONS=0"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-O3",
        "-march=native",
        "-mtune=native"
      ],
      "xcode_settings": {
        "OTHER_CFLAGS": [
          "-std=c++17",
          "-O3",
          "-march=native"
        ]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": [
            "/std:c++17",
            "/O2",
            "/arch:AVX2"
          ]
        }
      }
    }
  ]
}