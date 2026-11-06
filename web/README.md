# Browser UI

React and Monaco browser UI for the OpenSCAD workspace. Rendering and STL export happen in the browser; the server only lists and serves workspace files.

The component is derived from OpenSCAD Playground revision `012111f06bb6d8dac2b8d30318512494d87d6932` and the merged `openscad_browser` revision `f27c2da96c54906b81c2da560eeba8938e8e653a`. Source and dependency licenses remain in this directory.

`npm run prepare:assets -w web` downloads the checksum-pinned OpenSCAD WASM engine and Liberation fonts. `npm run build -w web` writes `dist/` with the browser bundle and worker. Mounted sources are read-only; pasted code renders from memory and is never written to the workspace.
