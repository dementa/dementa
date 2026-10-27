# Terminal's Linux (v86)

The Terminal app (src/os/terminal/) runs a real Linux in the browser with
[v86](https://github.com/copy/v86), an x86 emulator. These files are served as they are:

| File | What it is | From |
|---|---|---|
| `libv86.js`, `v86.wasm` | The emulator, v86 0.5.472 (BSD-2-Clause) | the `v86` npm package, `build/` |
| `buildroot-bzimage68.bin` | Linux 6.8.12 with busybox, built with Buildroot for v86 | https://i.copy.sh/buildroot-bzimage68.bin |
| `seabios.bin`, `vgabios.bin` | SeaBIOS and the VGA BIOS | https://github.com/copy/v86/tree/master/bios |

`libv86.js` is loaded as its own script rather than bundled: its module version mentions Node's
built-in modules, which the web build can't handle. After updating the `v86` package, copy
`node_modules/v86/build/libv86.js` and `v86.wasm` here again.

## Licences

The emulator is BSD-2-Clause. Linux, busybox and SeaBIOS are GPL software: sharing them is fine,
as long as people can get their source. The sources are at https://github.com/copy/v86 (Buildroot
configuration in `tools/docker/` and `docs/`), https://kernel.org, https://busybox.net and
https://www.seabios.org.
