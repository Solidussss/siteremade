# Models

`u2netp.onnx` finds the main subject of a photo (the car, the plate, the person) as a soft mask, so the photo hero
can light and focus the subject itself (lib/photo-analyse.js). It runs once per photo when a site is built, on the
server, with onnxruntime-web (WebAssembly, no GPU, no paid service).

- Model: U²-Netp, from https://github.com/xuebinqin/U-2-Net (Apache License 2.0, `LICENSE-u2netp.txt`)
- File: the ONNX export published with rembg (https://github.com/danielgatis/rembg, MIT), as redistributed in the
  npm package `@planby-tech/rmbg-webgpu` 0.2.1
- Size: 4.4 MB; input 1×3×320×320 (ImageNet normalisation), output a 320×320 saliency map
