#!/usr/bin/env bun
/**
 * Minimal Breakpad minidump reader — enough to answer "why did the renderer
 * crash": the signal, the faulting address, and which loaded module the crash PC
 * lands in (GPU driver vs chrome vs system lib). No external tooling.
 *
 * Usage: bun run scripts/parse-minidump.ts <dump.dmp>
 */
const path = process.argv[2];
if (!path) {
  console.error("usage: parse-minidump.ts <dump.dmp>");
  process.exit(1);
}
const ab = await Bun.file(path).arrayBuffer();
// These firmware dumps are MIME-wrapped Crashpad uploads — the actual minidump
// (signature "MDMP") starts some bytes in, after a multipart boundary. Find it;
// all RVAs are relative to the minidump start, so view from there.
const scan = new DataView(ab);
let base = -1;
for (let o = 0; o + 4 <= ab.byteLength; o++) {
  if (scan.getUint32(o, true) === 0x504d444d) {
    base = o;
    break;
  }
}
if (base < 0) {
  console.error("not a minidump (no MDMP signature found)");
  process.exit(1);
}
const buf = new DataView(ab, base);
const u16 = (o: number) => buf.getUint16(o, true);
const u32 = (o: number) => buf.getUint32(o, true);
const u64 = (o: number) => Number(buf.getBigUint64(o, true));
const streamCount = u32(8);
const dirRva = u32(12);
const streams = new Map<number, { size: number; rva: number }>();
for (let i = 0; i < streamCount; i++) {
  const o = dirRva + i * 12;
  streams.set(u32(o), { size: u32(o + 4), rva: u32(o + 8) });
}

function mdString(rva: number): string {
  if (rva <= 0 || rva + 4 > buf.byteLength) return "(bad-rva)";
  const len = Math.min(u32(rva), 1024);
  let s = "";
  for (let i = 0; i < len && rva + 4 + i + 2 <= buf.byteLength; i += 2) {
    s += String.fromCharCode(u16(rva + 4 + i));
  }
  return s;
}

// --- SystemInfo (7) ---
const ARCH: Record<number, string> = { 0: "x86", 5: "ARM", 9: "x86_64", 12: "ARM64", 0x8003: "ARM64" };
let arch = -1;
const si = streams.get(7);
if (si) arch = u16(si.rva);

// --- ModuleList (4) ---
const mods: { base: number; size: number; name: string }[] = [];
const ml = streams.get(4);
if (ml) {
  const n = u32(ml.rva);
  for (let i = 0; i < n; i++) {
    const o = ml.rva + 4 + i * 108;
    mods.push({ base: u64(o), size: u32(o + 8), name: mdString(u32(o + 20)) });
  }
}
const modOf = (a: number) => {
  const m = mods.find((m) => a >= m.base && a < m.base + m.size);
  return m ? `${m.name.split("/").pop()} +0x${(a - m.base).toString(16)}` : "(unmapped)";
};

// --- Exception (6) ---
const SIG: Record<number, string> = { 4: "SIGILL", 5: "SIGTRAP", 6: "SIGABRT", 7: "SIGBUS", 8: "SIGFPE", 11: "SIGSEGV" };
const out: Record<string, unknown> = { file: path.split("/").pop(), arch: ARCH[arch] ?? arch };
const ex = streams.get(6);
if (ex) {
  const r = ex.rva;
  out.signal = `${u32(r + 8)} ${SIG[u32(r + 8)] ?? ""}`.trim();
  out.si_code = u32(r + 12);
  const faultAddr = u64(r + 24);
  out.faultAddr = "0x" + faultAddr.toString(16);
  out.faultIn = modOf(faultAddr);
  const ctxRva = u32(r + 164); // ThreadContext.Rva (after 152-byte MINIDUMP_EXCEPTION)
  if (ctxRva) {
    if (arch === 5) {
      // MDRawContextARM: flags u32, iregs[16] (r0..r15), pc=r15, lr=r14, sp=r13
      const pc = u32(ctxRva + 4 + 15 * 4);
      const lr = u32(ctxRva + 4 + 14 * 4);
      out.pc = "0x" + pc.toString(16);
      out.pcIn = modOf(pc);
      out.lrIn = modOf(lr);
    } else if (arch === 12 || arch === 0x8003) {
      // MDRawContextARM64: flags u64, cpsr u32, (pad), iregs[31] x0..x30, sp, pc
      const pc = u64(ctxRva + 16 + 31 * 8 + 8);
      out.pc = "0x" + pc.toString(16);
      out.pcIn = modOf(pc);
    }
  }
}

console.log(JSON.stringify(out, null, 2));
const gfx = mods.filter((m) => /mali|gles|egl|libgl|gpu|drm|gbm|vulkan|skia/i.test(m.name)).map((m) => m.name);
console.log("graphics modules loaded:", gfx.length ? gfx : "(none in module list)");
console.log("total modules:", mods.length);
