use std::process::Command;
use std::fs;
use std::env;
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=../cpp/som_cache.cu");

    // Check if nvcc is available
    let has_cuda = Command::new("nvcc")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let out_dir = env::var("OUT_DIR").unwrap();
    let src_path = Path::new("../cpp/som_cache.cu");
    
    // On Windows, NVCC needs cl.exe in PATH and as host compiler
    if cfg!(windows) {
        let msvc_dir = "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC\\14.43.34808\\bin\\Hostx64\\x64";
        if Path::new(msvc_dir).exists() {
            if let Ok(current_path) = env::var("PATH") {
                let new_path = format!("{};{}", msvc_dir, current_path);
                env::set_var("PATH", new_path);
            }
        }
        env::set_var("CXX", "cl.exe");
    }
    
    let mut builder = cc::Build::new();

    if has_cuda {
        println!("cargo:warning=nvcc detected, building som_cache with CUDA support");
        builder.file(src_path);
        builder.cuda(true);
        builder.define("SOM_HAVE_CUDA", "1");
        // Link to cudart
        if let Ok(cuda_path) = env::var("CUDA_PATH") {
            println!("cargo:rustc-link-search=native={}/lib/x64", cuda_path);
        } else {
            // Check common paths
            for v in &["v13.0", "v12.8", "v12.6", "v12.5", "v12.4", "v12.3", "v12.2"] {
                let path = format!("C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/{}/lib/x64", v);
                if Path::new(&path).exists() {
                    println!("cargo:rustc-link-search=native={}", path);
                }
            }
        }
        println!("cargo:rustc-link-lib=static=cudart_static");
    } else {
        println!("cargo:warning=nvcc not found, compiling som_cache as CPU fallback");
        // Copy to a .cpp file in OUT_DIR so host compiler compiles it cleanly
        let dest_path = Path::new(&out_dir).join("som_cache_fallback.cpp");
        fs::copy(src_path, &dest_path).unwrap();
        
        builder.file(&dest_path);
        builder.cpp(true);
        builder.define("NO_CUDA", "1");
        builder.define("SOM_HAVE_CUDA", "0");
    }

    builder.compile("som_cache");
}
