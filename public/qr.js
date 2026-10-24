/*!
 * Minimal QR Code encoder for Estimo — byte mode, error correction level M,
 * versions 1–10 (up to 213 bytes, plenty for a room URL). No dependencies.
 * Algorithm follows ISO/IEC 18004; placement logic modelled on Project Nayuki's
 * reference implementation (MIT).
 *
 *   const qr = EstimoQR.encode("https://example.com/r/calm-otter-42");
 *   qr.size            // modules per side
 *   qr.modules[r][c]   // 1 = dark, 0 = light
 */
(function (root) {
  "use strict";

  // version -> [EC codewords per block, [[blockCount, dataCodewordsPerBlock], ...]] at level M
  const EC_M = {
    1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]],
    5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
  };
  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };
  const EC_LEVEL_BITS_M = 0; // L=1, M=0, Q=3, H=2

  /* ---- GF(256) arithmetic and Reed–Solomon ---- */
  const EXP = new Array(512), LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function rsGenerator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
      g = next;
    }
    return g;
  }
  function rsRemainder(data, n) {
    const g = rsGenerator(n);
    const rem = new Array(n).fill(0);
    for (const d of data) {
      const f = d ^ rem.shift();
      rem.push(0);
      for (let i = 0; i < n; i++) rem[i] ^= mul(g[i + 1], f);
    }
    return rem;
  }

  /* ---- data codewords ---- */
  function capacity(ver) { return EC_M[ver][1].reduce((a, [c, d]) => a + c * d, 0); }

  function codewords(bytes) {
    let ver = 1;
    for (; ver <= 10; ver++) {
      const ccBits = ver < 10 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= capacity(ver) * 8) break;
    }
    if (ver > 10) throw new RangeError("QR: text too long");
    const cap = capacity(ver);
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(0b0100, 4);                       // byte mode
    put(bytes.length, ver < 10 ? 8 : 16); // character count
    for (const b of bytes) put(b, 8);
    put(0, Math.min(4, cap * 8 - bits.length)); // terminator
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v); }
    for (let pad = 0; data.length < cap; pad ^= 1) data.push(pad ? 0x11 : 0xec);

    const [ecLen, groups] = EC_M[ver];
    const blocks = [];
    let k = 0;
    for (const [count, len] of groups) for (let i = 0; i < count; i++) {
      const d = data.slice(k, k + len); k += len;
      blocks.push({ d, e: rsRemainder(d, ecLen) });
    }
    const out = [];
    const maxLen = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
    return { ver, out };
  }

  /* ---- matrix ---- */
  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    const { ver, out } = codewords(bytes);
    const size = 17 + 4 * ver;
    const m = Array.from({ length: size }, () => new Array(size).fill(0));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (r, c, v) => { m[r][c] = v ? 1 : 0; fn[r][c] = true; };

    // finder patterns + separators
    const finder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(r, c, dark);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // timing patterns
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    // alignment patterns
    const al = ALIGN[ver], last = al[al.length - 1];
    for (const r of al) for (const c of al) {
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }

    // format information (also reserves its modules)
    const drawFormat = (mask) => {
      const data = (EC_LEVEL_BITS_M << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const b = (i) => (bits >>> i) & 1;
      for (let i = 0; i <= 5; i++) set(i, 8, b(i));
      set(7, 8, b(6)); set(8, 8, b(7)); set(8, 7, b(8));
      for (let i = 9; i < 15; i++) set(8, 14 - i, b(i));
      for (let i = 0; i < 8; i++) set(8, size - 1 - i, b(i));
      for (let i = 8; i < 15; i++) set(size - 15 + i, 8, b(i));
      set(size - 8, 8, 1); // dark module
    };
    drawFormat(0);

    // version information (v7+)
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const v = (bits >>> i) & 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(b, a, v); set(a, b, v);
      }
    }

    // data placement in the zig-zag pattern
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          const upward = ((right + 1) & 2) === 0;
          const r = upward ? size - 1 - vert : vert;
          if (!fn[r][c] && i < out.length * 8) { m[r][c] = (out[i >>> 3] >>> (7 - (i & 7))) & 1; i++; }
        }
      }
    }

    // choose the mask with the lowest penalty
    const MASKS = [
      (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];
    const applyMask = (k) => { for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!fn[r][c] && MASKS[k](r, c)) m[r][c] ^= 1; };
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < 8; k++) {
      applyMask(k); drawFormat(k);
      const s = penalty(m, size);
      if (s < bestScore) { bestScore = s; best = k; }
      applyMask(k); // undo (XOR)
    }
    applyMask(best); drawFormat(best);
    return { size, version: ver, mask: best, modules: m };
  }

  // Penalty rules N1 (runs), N2 (2x2 blocks), N3 (finder-like), N4 (balance)
  function penalty(m, size) {
    let score = 0, dark = 0;
    const line = (get) => {
      let s = 0, run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && get(i) === get(i - 1)) run++;
        else { if (run >= 5) s += run - 2; run = 1; }
      }
      for (let i = 0; i + 10 < size; i++) {
        const seq = Array.from({ length: 11 }, (_, k) => get(i + k)).join("");
        if (seq === "10111010000" || seq === "00001011101") s += 40;
      }
      return s;
    };
    for (let r = 0; r < size; r++) score += line((c) => m[r][c]);
    for (let c = 0; c < size; c++) score += line((r) => m[r][c]);
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
    score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  }

  /** SVG markup with a quiet zone, dark modules as one path. */
  function toSvg(text, { dark = "#141413", light = "#ffffff", quiet = 2 } = {}) {
    const q = encode(text), n = q.size;
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules[r][c]) d += `M${c} ${r}h1v1h-1z`;
    const v = n + quiet * 2;
    return `<svg viewBox="${-quiet} ${-quiet} ${v} ${v}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="${-quiet}" y="${-quiet}" width="${v}" height="${v}" fill="${light}"/><path fill="${dark}" d="${d}"/></svg>`;
  }

  const api = { encode, toSvg };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EstimoQR = api;
})(typeof self !== "undefined" ? self : this);
