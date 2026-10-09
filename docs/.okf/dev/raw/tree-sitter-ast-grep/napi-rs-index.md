[Skip to content](https://napi.rs/#main-content)

# Building pre-compiled  Node.js addons in Rust

### Seamless WebAssembly integration, safer API designs with lifetime management, and simplified cross-compilation for broader platform support.

[Get Started](https://napi.rs/docs/introduction/getting-started) [![GitHub logo](https://napi.rs/assets/github.svg)GitHub](https://github.com/napi-rs/napi-rs)

Rust CratesC/C++Node.jsNode.js addonWASI moduleTypeScript typesnpm packages

![NAPI-RS Logo](https://napi.rs/img/favicon.png)

## Live WASM + NAPI-RS Demo

### This is a sample app using NAPI-RS WebAssembly. You can transform the image to webp, jpeg or avif with different quality.

Transform Image App

TS Code

```
import { Transformer } from '@napi-rs/image'

export async function transform() {
  const imageResponse = await fetch(
    'https://upload.wikimedia.org/wikipedia/commons/5/5d/ISS-45_EVA-2_%28a%29_Scott_Kelly.jpg'
  )

  const imageBytes = await imageResponse.arrayBuffer()

  const transformer = new Transformer(imageBytes)
  const webp = await transformer.toWebp()
}
```

Rust Code

```
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub struct Transformer {
  inner: Uint8Array,
}

#[napi]
impl Transformer {
  #[napi(constructor)]
  pub fn new(inner: Uint8Array) -> Self {
    Self { inner }
  }

  #[napi]
  pub fn to_webp(&self) -> Result<Uint8Array> {
    let image = image::load_from_memory(&self.inner)?;
    let webp = image.to_webp().map_err(|e| Error::from(e.to_string()))?;
    Ok(webp.into())
  }
}
```

## Feature Highlights

\> napi build

Finished \`release\` profile \[optimized\] target(s)

### Zero-Config Build (napi build)

Simple build command, no file copy or hand writing js binding needed.

### Powerful & Flexible CI

Reduce the complex CI setup, stay focus on your development.

![Apple](data:image/svg+xml,%3c?xml%20version=%271.0%27%20encoding=%27UTF-8%27%20standalone=%27no%27?%3e%3c!--%20Uploaded%20to:%20SVG%20Repo,%20www.svgrepo.com,%20Generator:%20SVG%20Repo%20Mixer%20Tools%20--%3e%3csvg%20width=%27800px%27%20height=%27800px%27%20viewBox=%27-1.5%200%2020%2020%27%20version=%271.1%27%20xmlns=%27http://www.w3.org/2000/svg%27%20xmlns:xlink=%27http://www.w3.org/1999/xlink%27%3e%3ctitle%3eapple%20[%23173]%3c/title%3e%3cdesc%3eCreated%20with%20Sketch.%3c/desc%3e%3cdefs%3e%3c/defs%3e%3cg%20id=%27Page-1%27%20stroke=%27none%27%20stroke-width=%271%27%20fill=%27none%27%20fill-rule=%27evenodd%27%3e%3cg%20id=%27Dribbble-Light-Preview%27%20transform=%27translate(-102.000000,%20-7439.000000)%27%20fill=%27%23808080%27%3e%3cg%20id=%27icons%27%20transform=%27translate(56.000000,%20160.000000)%27%3e%3cpath%20d=%27M57.5708873,7282.19296%20C58.2999598,7281.34797%2058.7914012,7280.17098%2058.6569121,7279%20C57.6062792,7279.04%2056.3352055,7279.67099%2055.5818643,7280.51498%20C54.905374,7281.26397%2054.3148354,7282.46095%2054.4735932,7283.60894%20C55.6455696,7283.69593%2056.8418148,7283.03894%2057.5708873,7282.19296%20M60.1989864,7289.62485%20C60.2283111,7292.65181%2062.9696641,7293.65879%2063,7293.67179%20C62.9777537,7293.74279%2062.562152,7295.10677%2061.5560117,7296.51675%20C60.6853718,7297.73474%2059.7823735,7298.94772%2058.3596204,7298.97372%20C56.9621472,7298.99872%2056.5121648,7298.17973%2054.9134635,7298.17973%20C53.3157735,7298.17973%2052.8162425,7298.94772%2051.4935978,7298.99872%20C50.1203933,7299.04772%2049.0738052,7297.68074%2048.197098,7296.46676%20C46.4032359,7293.98379%2045.0330649,7289.44985%2046.8734421,7286.3899%20C47.7875635,7284.87092%2049.4206455,7283.90793%2051.1942837,7283.88393%20C52.5422083,7283.85893%2053.8153044,7284.75292%2054.6394294,7284.75292%20C55.4635543,7284.75292%2057.0106846,7283.67793%2058.6366882,7283.83593%20C59.3172232,7283.86293%2061.2283842,7284.09893%2062.4549652,7285.8199%20C62.355868,7285.8789%2060.1747177,7287.09489%2060.1989864,7289.62485%27%20id=%27apple-[%23173]%27%3e%3c/path%3e%3c/g%3e%3c/g%3e%3c/g%3e%3c/svg%3e)

![Node](data:image/svg+xml,%3c?xml%20version=%271.0%27%20encoding=%27utf-8%27?%3e%3c!--%20Uploaded%20to:%20SVG%20Repo,%20www.svgrepo.com,%20Generator:%20SVG%20Repo%20Mixer%20Tools%20--%3e%3csvg%20width=%27800px%27%20height=%27800px%27%20viewBox=%27-3.8%20-1.5%2040.921%2040.921%27%20xmlns=%27http://www.w3.org/2000/svg%27%3e%3cdefs%3e%3clinearGradient%20id=%27b%27%20x1=%27271.97%27%20x2=%27211.104%27%20y1=%27217.606%27%20y2=%27341.772%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%27.3%27%20stop-color=%27%233e863d%27/%3e%3cstop%20offset=%27.5%27%20stop-color=%27%2355934f%27/%3e%3cstop%20offset=%27.8%27%20stop-color=%27%235aad45%27/%3e%3c/linearGradient%3e%3clinearGradient%20id=%27d%27%20x1=%27186.484%27%20x2=%27297.349%27%20y1=%27321.381%27%20y2=%27239.465%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%27.57%27%20stop-color=%27%233e863d%27/%3e%3cstop%20offset=%27.72%27%20stop-color=%27%23619857%27/%3e%3cstop%20offset=%271%27%20stop-color=%27%2376ac64%27/%3e%3c/linearGradient%3e%3clinearGradient%20id=%27f%27%20x1=%27197.051%27%20x2=%27288.72%27%20y1=%27279.652%27%20y2=%27279.652%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%27.16%27%20stop-color=%27%236bbf47%27/%3e%3cstop%20offset=%27.38%27%20stop-color=%27%2379b461%27/%3e%3cstop%20offset=%27.47%27%20stop-color=%27%2375ac64%27/%3e%3cstop%20offset=%27.7%27%20stop-color=%27%23659e5a%27/%3e%3cstop%20offset=%27.9%27%20stop-color=%27%233e863d%27/%3e%3c/linearGradient%3e%3cclipPath%20id=%27a%27%3e%3cpath%20d=%27m239.03%20226.605-42.13%2024.317a5.085%205.085%200%200%200-2.546%204.406v48.668c0%201.817.968%203.496%202.546%204.406l42.133%2024.336a5.1%205.1%200%200%200%205.09%200l42.126-24.336a5.096%205.096%200%200%200%202.54-4.406v-48.668c0-1.816-.97-3.496-2.55-4.406l-42.12-24.317a5.123%205.123%200%200%200-5.1%200%27/%3e%3c/clipPath%3e%3cclipPath%20id=%27c%27%3e%3cpath%20d=%27M195.398%20307.086c.403.523.907.976%201.5%201.316l36.14%2020.875%206.02%203.46c.9.52%201.926.74%202.934.665.336-.027.672-.09%201-.183l44.434-81.36c-.34-.37-.738-.68-1.184-.94l-27.586-15.93-14.582-8.39a5.318%205.318%200%200%200-1.32-.53zm0%200%27/%3e%3c/clipPath%3e%3cclipPath%20id=%27e%27%3e%3cpath%20d=%27M241.066%20225.953a5.14%205.14%200%200%200-2.035.652l-42.01%2024.247%2045.3%2082.51c.63-.09%201.25-.3%201.81-.624l42.13-24.336a5.105%205.105%200%200%200%202.46-3.476l-46.18-78.89a5.29%205.29%200%200%200-1.03-.102l-.42.02%27/%3e%3c/clipPath%3e%3c/defs%3e%3cg%20clip-path=%27url(%23a)%27%20transform=%27translate(-68.564%20-79.701)%20scale(.35278)%27%3e%3cpath%20fill=%27url(%23b)%27%20d=%27m331.363%20246.793-118.715-58.19-60.87%20124.174L270.49%20370.97zm0%200%27/%3e%3c/g%3e%3cg%20clip-path=%27url(%23c)%27%20transform=%27translate(-68.564%20-79.701)%20scale(.35278)%27%3e%3cpath%20fill=%27url(%23d)%27%20d=%27m144.07%20264.004%2083.825%20113.453%20110.86-81.906-83.83-113.45zm0%200%27/%3e%3c/g%3e%3cg%20clip-path=%27url(%23e)%27%20transform=%27translate(-68.564%20-79.701)%20scale(.35278)%27%3e%3cpath%20fill=%27url(%23f)%27%20d=%27M197.02%20225.934v107.43h91.683v-107.43zm0%200%27/%3e%3c/g%3e%3c/svg%3e)

![Linux](https://napi.rs/assets/linux-Bsu6HcYm.svg)

![Chrome](data:image/svg+xml,%3c?xml%20version=%271.0%27%20encoding=%27utf-8%27?%3e%3c!--%20Uploaded%20to:%20SVG%20Repo,%20www.svgrepo.com,%20Generator:%20SVG%20Repo%20Mixer%20Tools%20--%3e%3csvg%20width=%27800px%27%20height=%27800px%27%20viewBox=%270%200%20190%20190%27%20xmlns=%27http://www.w3.org/2000/svg%27%20xmlns:xlink=%27http://www.w3.org/1999/xlink%27%20fill=%27none%27%3e%3clinearGradient%20id=%27d%27%20x1=%2728.3%27%20x2=%2780.8%27%20y1=%2775%27%20y2=%2744.4%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%270%27%20stop-color=%27%23a52714%27%20stop-opacity=%27.6%27/%3e%3cstop%20offset=%27.7%27%20stop-color=%27%23a52714%27%20stop-opacity=%270%27/%3e%3c/linearGradient%3e%3clinearGradient%20id=%27f%27%20x1=%27109.9%27%20x2=%2751.5%27%20y1=%27164.5%27%20y2=%27130.3%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%270%27%20stop-color=%27%23055524%27%20stop-opacity=%27.4%27/%3e%3cstop%20offset=%27.3%27%20stop-color=%27%23055524%27%20stop-opacity=%270%27/%3e%3c/linearGradient%3e%3clinearGradient%20id=%27h%27%20x1=%27121.9%27%20x2=%27136.6%27%20y1=%2749.8%27%20y2=%27114.1%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%270%27%20stop-color=%27%23ea6100%27%20stop-opacity=%27.3%27/%3e%3cstop%20offset=%27.7%27%20stop-color=%27%23ea6100%27%20stop-opacity=%270%27/%3e%3c/linearGradient%3e%3cradialGradient%20id=%27a%27%20cx=%2791.2%27%20cy=%2755%27%20r=%2784.1%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%270%27%20stop-color=%27%233e2723%27%20stop-opacity=%27.2%27/%3e%3cstop%20offset=%271%27%20stop-color=%27%233e2723%27%20stop-opacity=%270%27/%3e%3c/radialGradient%3e%3cradialGradient%20id=%27i%27%20cx=%2720.9%27%20cy=%2747.5%27%20r=%2778%27%20xlink:href=%27%23a%27/%3e%3cradialGradient%20id=%27j%27%20cx=%2794.8%27%20cy=%2795.1%27%20r=%2787.9%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%270%27%20stop-color=%27%23263238%27%20stop-opacity=%27.2%27/%3e%3cstop%20offset=%271%27%20stop-color=%27%23263238%27%20stop-opacity=%270%27/%3e%3c/radialGradient%3e%3cradialGradient%20id=%27k%27%20cx=%2733.3%27%20cy=%2731%27%20r=%27176.8%27%20gradientUnits=%27userSpaceOnUse%27%3e%3cstop%20offset=%270%27%20stop-color=%27%23ffffff%27%20stop-opacity=%27.1%27/%3e%3cstop%20offset=%271%27%20stop-color=%27%23ffffff%27%20stop-opacity=%270%27/%3e%3c/radialGradient%3e%3cclipPath%20id=%27b%27%3e%3ccircle%20cx=%2795%27%20cy=%2795%27%20r=%2788%27/%3e%3c/clipPath%3e%3cg%20clip-path=%27url(%23b)%27%3e%3cuse%20fill=%27%23db4437%27%20xlink:href=%27%23c%27/%3e%3cuse%20fill=%27url(%23d)%27%20xlink:href=%27%23c%27/%3e%3cuse%20fill=%27%230f9d58%27%20xlink:href=%27%23e%27/%3e%3cuse%20fill=%27url(%23f)%27%20xlink:href=%27%23e%27/%3e%3cuse%20fill=%27%23ffcd40%27%20xlink:href=%27%23g%27/%3e%3cuse%20fill=%27url(%23h)%27%20xlink:href=%27%23g%27/%3e%3cg%20fill-opacity=%27.1%27%3e%3cpath%20fill=%27%233e2723%27%20d=%27M61.3%20114.7L21%2047.4l39%2067.8z%27/%3e%3cpath%20fill=%27%23263238%27%20d=%27M128.8%20116.3l-.8-.4-37.3%2067%2038.3-67z%27/%3e%3c/g%3e%3cpath%20id=%27e%27%20d=%27M7%20183h83.8l39-39v-29H60.2L7%2023.5z%27/%3e%3cpath%20id=%27g%27%20d=%27M95%2055l34.6%2060L91%20183h92V55z%27/%3e%3cpath%20id=%27c%27%20d=%27M21%207v108h39.4L95%2055h88V7z%27/%3e%3cpath%20fill=%27url(%23a)%27%20d=%27M95%2055v21l78.4-21z%27/%3e%3cpath%20fill=%27url(%23i)%27%20d=%27M21%2047.5l57.2%2057.2L60.4%20115z%27/%3e%3cpath%20fill=%27url(%23j)%27%20d=%27M90.8%20183l21-78.3%2017.8%2010.3z%27/%3e%3ccircle%20cx=%2795%27%20cy=%2795%27%20r=%2740%27%20fill=%27%23f1f1f1%27/%3e%3ccircle%20cx=%2795%27%20cy=%2795%27%20r=%2732%27%20fill=%27%234285f4%27/%3e%3ccircle%20cx=%2795%27%20cy=%2795%27%20r=%2788%27%20fill=%27url(%23k)%27/%3e%3cg%20fill=%27%233e2723%27%20fill-opacity=%27.1%27%3e%3cpath%20fill=%27%23ffffff%27%20d=%27M129.6%20115a40%2040%200%2001-69.2%200L7%2024.5%2060.4%20116a40%2040%200%200069.2%200z%27/%3e%3cpath%20d=%27M96%2055h-.5a40%2040%200%20110%2080h.5c22%200%2040-18%2040-40s-18-40-40-40zm-1%20127a88%2088%200%200088-87.5v.5A88%2088%200%20017%2095v-.5A88%2088%200%200095%20182z%27/%3e%3cg%20fill-opacity=%27.2%27%3e%3cpath%20fill=%27%23ffffff%27%20d=%27M130%20116.3a39.3%2039.3%200%20003.4-32%2038%2038%200%2001-3.8%2030.7L92%20183l38.2-66.5zM95%208a88%2088%200%200188%2087.5V95A88%2088%200%20007%2095v.5A88%2088%200%200195%208z%27/%3e%3cpath%20d=%27M95%2054c-22%200-40%2018-40%2040v1c0-22%2018-40%2040-40h88v-1z%27/%3e%3c/g%3e%3c/g%3e%3c/g%3e%3c/svg%3e)

![WebAssembly](data:image/svg+xml,%3csvg%20width='48'%20height='48'%20viewBox='0%200%2048%2048'%20fill='none'%20xmlns='http://www.w3.org/2000/svg'%3e%3cmask%20id='mask0_1_891'%20style='mask-type:luminance'%20maskUnits='userSpaceOnUse'%20x='0'%20y='0'%20width='48'%20height='48'%3e%3cpath%20d='M47.4436%200.0210037H0.0230103V47.4416H47.4436V0.0210037Z'%20fill='white'/%3e%3c/mask%3e%3cg%20mask='url(%23mask0_1_891)'%3e%3cpath%20d='M29.158%200.0210037C29.158%200.105004%2029.158%200.188%2029.158%200.277C29.158%203.28%2026.723%205.714%2023.721%205.714C20.717%205.714%2018.283%203.279%2018.283%200.277C18.283%200.188%2018.283%200.105004%2018.283%200.0210037H0.0230103V47.442H47.444V0.0210037H29.158Z'%20fill='%23654FF0'/%3e%3cpath%20d='M11.04%2025.576H14.183L16.328%2037.003H16.367L18.946%2025.576H21.886L24.215%2037.143H24.26L26.706%2025.576H29.788L25.783%2042.366H22.664L20.354%2030.94H20.294L17.821%2042.366H14.645L11.04%2025.576ZM33.332%2025.576H38.286L43.206%2042.366H39.964L38.894%2038.63H33.25L32.424%2042.366H29.267L33.332%2025.576ZM35.218%2029.715L33.847%2035.875H38.113L36.539%2029.715H35.218Z'%20fill='white'/%3e%3c/g%3e%3c/svg%3e)

![ubuntu](data:image/svg+xml,%3c?xml%20version=%271.0%27%20encoding=%27utf-8%27?%3e%3c!--%20Uploaded%20to:%20SVG%20Repo,%20www.svgrepo.com,%20Generator:%20SVG%20Repo%20Mixer%20Tools%20--%3e%3csvg%20width=%27800px%27%20height=%27800px%27%20viewBox=%270%200%2032%2032%27%20fill=%27none%27%20xmlns=%27http://www.w3.org/2000/svg%27%3e%3cpath%20d=%27M30%2016C30%2023.728%2023.735%2030%2016%2030C8.265%2030%202%2023.728%202%2016C2%208.265%208.265%202%2016%202C23.735%202%2030%208.265%2030%2016Z%27%20fill=%27%23E95420%27/%3e%3cpath%20d=%27M6.82154%2014.1563C5.81185%2014.1563%205%2014.9865%205%2016.0035C5%2017.0205%205.81867%2017.8507%206.82154%2017.8507C7.82442%2017.8507%208.64309%2017.0205%208.64309%2016.0035C8.64309%2014.9795%207.82442%2014.1563%206.82154%2014.1563ZM19.8316%2022.5482C18.9583%2023.0602%2018.665%2024.1879%2019.163%2025.0734C19.6679%2025.959%2020.7799%2026.2634%2021.6531%2025.7514C22.5264%2025.2395%2022.8197%2024.1118%2022.3217%2023.2262C21.8101%2022.3476%2020.698%2022.0432%2019.8316%2022.5482ZM10.7785%2016.0035C10.7785%2014.177%2011.6722%2012.565%2013.0434%2011.5896L11.7131%209.32725C10.1167%2010.4065%208.93645%2012.06%208.43842%2013.9902C9.01149%2014.4676%209.37989%2015.194%209.37989%2016.0035C9.37989%2016.8129%209.01149%2017.5393%208.43842%2018.0167C8.92962%2019.9469%2010.1167%2021.6004%2011.7131%2022.6797L13.0434%2020.4174C11.6722%2019.4419%2010.7785%2017.8299%2010.7785%2016.0035ZM16.0998%2010.6071C18.8833%2010.6071%2021.1619%2012.7657%2021.4007%2015.5261L24%2015.4846C23.8704%2013.4506%2022.9971%2011.6241%2021.6463%2010.282C20.9504%2010.5449%2020.1522%2010.5034%2019.4632%2010.1021C18.7673%209.69393%2018.3375%209.01593%2018.2147%208.26875C17.5393%208.08195%2016.8298%207.97817%2016.0998%207.97817C14.8377%207.97817%2013.6506%208.27566%2012.5932%208.80838L13.8621%2011.1053C14.5375%2010.787%2015.3016%2010.6071%2016.0998%2010.6071ZM16.0998%2021.3998C15.3016%2021.3998%2014.5375%2021.2199%2013.8553%2020.9017L12.5864%2023.1985C13.6438%2023.7313%2014.8377%2024.0287%2016.093%2024.0287C16.823%2024.0287%2017.5325%2023.925%2018.2079%2023.7382C18.3239%2022.9979%2018.7605%2022.313%2019.4564%2021.9048C20.1454%2021.4966%2020.9504%2021.462%2021.6395%2021.7249C22.9835%2020.3828%2023.8636%2018.5563%2023.9932%2016.5223L21.3939%2016.4808C21.1619%2019.2343%2018.8833%2021.3998%2016.0998%2021.3998ZM19.8248%209.45178C20.698%209.96374%2021.8101%209.65933%2022.3149%208.77378C22.8197%207.88824%2022.5196%206.76054%2021.6463%206.24859C20.7731%205.73663%2019.661%206.04104%2019.1562%206.92659C18.6582%207.81213%2018.9583%208.93983%2019.8248%209.45178Z%27%20fill=%27white%27/%3e%3c/svg%3e)

### Portable Native Packages

Package per-target native binaries with an optional WASI fallback.

![NAPI-RS logo](https://napi.rs/img/favicon.png) NAPI-RS

Optimized Performance

Low-overhead generated bindings with high-level features.

Sponsors

Sponsors

NAPI-RS is supported by amazing sponsors

Special Thanks

[![VoidZero](https://avatars.githubusercontent.com/u/149750581?v=4)\\
\\
VoidZero](https://github.com/voidzero-dev)

Gold Sponsors

[![ChainSafe](https://avatars.githubusercontent.com/u/27474093?v=4)\\
\\
ChainSafe](https://github.com/ChainSafe)

[![Zephyr](https://avatars.githubusercontent.com/u/144168943?v=4)\\
\\
Zephyr](https://github.com/ZephyrCloudIO)

Sliver Sponsors

[![Donny/강동윤](https://avatars.githubusercontent.com/u/29931815?u=2d5d37e8b4bc2794d3c75b9a5b95249a9e9b9c4f&v=4)\\
\\
Donny/강동윤](https://github.com/kdy1)

[![Stephen Belanger](https://avatars.githubusercontent.com/u/205482?u=de3265fd6a286e3e51965136cbe7a04bb9ec051a&v=4)\\
\\
Stephen Belanger](https://github.com/Qard)

[![Tim Fish](https://avatars.githubusercontent.com/u/1150298?u=7b5e3672b9a3db89a933e230c4d01990a236408e&v=4)\\
\\
Tim Fish](https://github.com/timfish)

[![Néstor](https://avatars.githubusercontent.com/u/23436531?u=768892d46636e864e980c77f47bba39dcbd6a7d4&v=4)\\
\\
Néstor](https://github.com/Nsttt)

[![Nx](https://avatars.githubusercontent.com/u/23692104?v=4)\\
\\
Nx](https://github.com/nrwl)

[![OmanderConsulting](https://avatars.githubusercontent.com/u/94077176?v=4)\\
\\
OmanderConsulting](https://github.com/omanderconsulting)

[![Contrast Security OSS](https://avatars.githubusercontent.com/u/5577345?v=4)\\
\\
Contrast Security OSS](https://github.com/Contrast-Security-OSS)

[![Sent](https://avatars.githubusercontent.com/u/153308555?v=4)\\
\\
Sent](https://github.com/sentdm)

[![TestMu AI Open Source Office (Formerly LambdaTest)](https://avatars.githubusercontent.com/u/171592363?u=080d9ba6069d0ff2a0558825ff2f667c45807687&v=4)\\
\\
TestMu AI Open Source Office (Formerly LambdaTest)](https://www.testmuai.com/?utm_medium=sponsor&utm_source=napi-rs)

Backers

[![Encore](https://avatars.githubusercontent.com/u/50438175?v=4)\\
\\
Encore](https://github.com/encoredev)

[![LongYinan](https://avatars.githubusercontent.com/u/3468483?u=daf25d236ad2cc227470fa0da2d5bdf3dbb7feed&v=4)\\
\\
LongYinan](https://github.com/Brooooooklyn)

[![Daanyaal Sobani](https://avatars.githubusercontent.com/u/22554139?u=5c4dbf4a619f8ca348a463b93abe2dba93e8abe3&v=4)\\
\\
Daanyaal Sobani](https://github.com/DaanyaalSobani)

[![Stencila](https://avatars.githubusercontent.com/u/732692?v=4)\\
\\
Stencila](https://github.com/stencila)

[![Tommy D. Rossi](https://avatars.githubusercontent.com/u/31321188?u=98d0726a329d89e8486ec9eb4ff8085dcb220110&v=4)\\
\\
Tommy D. Rossi](https://github.com/remorses)

[![Syntax](https://avatars.githubusercontent.com/u/130389858?v=4)\\
\\
Syntax](https://github.com/syntaxfm)

[Become a Sponsor](https://github.com/sponsors/napi-rs)

Support Matrix

Support Matrix

Runtime compatibility

Node-API ABI stabilityOne binary can span compatible Node.js releases. The Node-API level sets the actual runtime floor.

Current napi-rs source CI:

- Node 22
- Node 24
- Node 26

Use Node.js 22.13+ or 24+ for the current build CLI. Bun is best-effort in upstream CI; Deno is not in the blocking native-addon matrix.

[Read the complete support contract →](https://napi.rs/docs/more/support-compatibility)

Generated template build targets

|  | ia32 | x64 | arm64 | arm | WASI |
| --- | --- | --- | --- | --- | --- |
| Windows MSVC |  |  |  |  |  |
| macOS |  |  |  |  |  |
| Linux glibc |  |  |  |  |  |
| Linux musl |  |  |  |  |  |
| FreeBSD |  |  |  |  |  |
| Android |  |  |  |  |  |
| WebAssembly |  |  |  |  |  |

Included in the maintained scaffold's build/package matrix.

Not included in the maintained scaffold; it may require manual support or may be unavailable.

[Accepted targets and test coverage →](https://napi.rs/docs/more/support-compatibility)

Trusted Tech Ecosystem

Trusted Tech Ecosystem

[**AFFiNE**](https://affine.pro/) [Prisma.io](https://www.prisma.io/) [![swc](https://napi.rs/assets/swc.png)SWC](https://swc.rs/) [![Parcel](https://napi.rs/assets/parcel.png)](https://parceljs.org/) [![next.js](https://napi.rs/assets/next-logo.png)](https://nextjs.org/) [![cursor](https://napi.rs/assets/cursor.png)](https://cursor.com/) [![pola.rs](https://napi.rs/assets/pola.svg)Polars](https://www.pola.rs/) [![logseq](https://napi.rs/assets/logseq.png)Logseq](https://logseq.com/) [Format.JS](https://formatjs.io/) [![astgrep](https://napi.rs/assets/ast-grep.svg)](https://ast-grep.github.io/) [![perfsee](https://napi.rs/assets/perfsee.png)Perfsee](https://perfsee.com/)

[**AFFiNE**](https://affine.pro/) [Prisma.io](https://www.prisma.io/) [![swc](https://napi.rs/assets/swc.png)SWC](https://swc.rs/) [![Parcel](https://napi.rs/assets/parcel.png)](https://parceljs.org/) [![next.js](https://napi.rs/assets/next-logo.png)](https://nextjs.org/) [![cursor](https://napi.rs/assets/cursor.png)](https://cursor.com/) [![pola.rs](https://napi.rs/assets/pola.svg)Polars](https://www.pola.rs/) [![logseq](https://napi.rs/assets/logseq.png)Logseq](https://logseq.com/) [Format.JS](https://formatjs.io/) [![astgrep](https://napi.rs/assets/ast-grep.svg)](https://ast-grep.github.io/) [![perfsee](https://napi.rs/assets/perfsee.png)Perfsee](https://perfsee.com/)

[![npmmirror](https://napi.rs/assets/npmmirror.png)](https://npmmirror.com/)[**Databend**](https://databend.rs/) [![rspack](https://napi.rs/assets/rspack-logo.svg)**Rspack**](https://rspack.dev/) [**Hugging Face**](https://github.com/huggingface/tokenizers) [**ditto**](https://www.ditto.live/) [Turborepo logo](https://turbo.build/) [**Loro**](https://loro.dev/) [**Rollup**](https://github.com/rollup/rollup) [![tensorzero](https://napi.rs/assets/tensorzero.svg)TensorZero](https://www.tensorzero.com/) [![chroma](https://napi.rs/assets/chroma.png)Chroma](https://www.trychroma.com/) [**NVIDIA**](https://github.com/NVIDIA/NeMo-Relay) [![turbopuffer](https://napi.rs/assets/turbopuffer.svg)turbopuffer](https://github.com/turbopuffer/alyze) [**Clerk**](https://github.com/clerk/javascript) [**React**](https://github.com/react/react) [**Microsoft**](https://github.com/microsoft/agent-governance-toolkit) [![LlamaIndex](https://napi.rs/assets/llamaindex.svg)**LlamaIndex**](https://github.com/run-llama/liteparse) [![screenpipe](https://napi.rs/assets/screenpipe.png)**screenpipe**](https://github.com/screenpipe/screenpipe)

[![npmmirror](https://napi.rs/assets/npmmirror.png)](https://npmmirror.com/)[**Databend**](https://databend.rs/) [![rspack](https://napi.rs/assets/rspack-logo.svg)**Rspack**](https://rspack.dev/) [**Hugging Face**](https://github.com/huggingface/tokenizers) [**ditto**](https://www.ditto.live/) [Turborepo logo](https://turbo.build/) [**Loro**](https://loro.dev/) [**Rollup**](https://github.com/rollup/rollup) [![tensorzero](https://napi.rs/assets/tensorzero.svg)TensorZero](https://www.tensorzero.com/) [![chroma](https://napi.rs/assets/chroma.png)Chroma](https://www.trychroma.com/) [**NVIDIA**](https://github.com/NVIDIA/NeMo-Relay) [![turbopuffer](https://napi.rs/assets/turbopuffer.svg)turbopuffer](https://github.com/turbopuffer/alyze) [**Clerk**](https://github.com/clerk/javascript) [**React**](https://github.com/react/react) [**Microsoft**](https://github.com/microsoft/agent-governance-toolkit) [![LlamaIndex](https://napi.rs/assets/llamaindex.svg)**LlamaIndex**](https://github.com/run-llama/liteparse) [![screenpipe](https://napi.rs/assets/screenpipe.png)**screenpipe**](https://github.com/screenpipe/screenpipe)