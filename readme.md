# Launching the app

I am testing two differnt options.

1. Everything Rust (WASM + NATIVE UI): Using Native UI development using egui/eframe, which leverages WebGL. It uses immediete UI mode, so UI changes are written directly to the display device. It provides suport for native UI, and also have the capability to run the code as WASM.
2. REACT FrontEnd + Rust Backend (Only Native Apps): Using Tauri, which uses react front end, and Rust as the back end. Provides more flexibility in UI development.

Please refer the respective project folders for more details.

Also check out the docs folder, which has detailed info about the two UIs.