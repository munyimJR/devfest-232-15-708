// SHA-256 of file bytes, used to detect duplicate files.
// Uses Web Crypto (crypto.subtle). crypto.subtle only exists on secure origins
// (https / localhost), so a small pure-JS fallback keeps the app working when it
// is served over plain http on a local network.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function toHex(words) {
  let out = "";
  for (const word of words) out += word.toString(16).padStart(8, "0");
  return out;
}

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function compress(H, W, view, offset) {
  for (let t = 0; t < 16; t += 1) W[t] = view.getUint32(offset + t * 4);
  for (let t = 16; t < 64; t += 1) {
    const w15 = W[t - 15];
    const w2 = W[t - 2];
    const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
    const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
    W[t] = W[t - 16] + s0 + W[t - 7] + s1;
  }
  let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
  for (let t = 0; t < 64; t += 1) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  H[0] += a; H[1] += b; H[2] += c; H[3] += d;
  H[4] += e; H[5] += f; H[6] += g; H[7] += h;
}

/** Pure-JS SHA-256 (fallback). Returns a lowercase hex string. */
export function sha256HexSync(bytes) {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const W = new Uint32Array(64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fullBlocks = Math.floor(bytes.length / 64);
  for (let i = 0; i < fullBlocks; i += 1) compress(H, W, view, i * 64);

  const rest = bytes.length - fullBlocks * 64;
  const tail = new Uint8Array(rest < 56 ? 64 : 128);
  tail.set(bytes.subarray(fullBlocks * 64));
  tail[rest] = 0x80;
  const tailView = new DataView(tail.buffer);
  const bitLength = bytes.length * 8;
  tailView.setUint32(tail.length - 8, Math.floor(bitLength / 0x100000000));
  tailView.setUint32(tail.length - 4, bitLength >>> 0);
  for (let offset = 0; offset < tail.length; offset += 64) compress(H, W, tailView, offset);
  return toHex(H);
}

/** SHA-256 hex digest of `bytes` (Uint8Array). */
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const digest = await subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // fall through to the pure-JS version
    }
  }
  return sha256HexSync(bytes);
}
