// Score + SFX as one piece: 120 BPM, A minor, everything on the beat grid from frame 0.
import { writeFileSync } from 'node:fs'
const SR = 48000, DUR = 20, N = SR * DUR
const L = new Float32Array(N), R = new Float32Array(N)
const revL = new Float32Array(N), revR = new Float32Array(N) // reverb send
const duck = new Float32Array(N).fill(1) // sidechain from the kick
const B = 0.5, BAR = 2
const hz = (m) => 440 * 2 ** ((m - 69) / 12)
let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1

function add(t0, buf, gain = 1, pan = 0, send = 0) {
  const s = Math.round(t0 * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4)
  for (let i = 0; i < buf.length; i++) {
    const j = s + i; if (j < 0 || j >= N) continue
    L[j] += buf[i] * gl; R[j] += buf[i] * gr
    if (send) { revL[j] += buf[i] * gl * send; revR[j] += buf[i] * gr * send }
  }
}
function biquad(buf, type, f, q = 0.707) {
  const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w)
  let b0, b1, b2
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0 }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0 }
  else { b0 = a; b1 = 0; b2 = -a }
  const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  const out = new Float32Array(buf.length)
  for (let i = 0; i < buf.length; i++) {
    const y = (b0 * buf[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = buf[i]; y2 = y1; y1 = y; out[i] = y
  }
  return out
}

// Electric piano (FM), one note.
function ep(f, dur, vel = 1) {
  const n = Math.round((dur + 1.2) * SR), out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR, rel = t > dur ? Math.exp(-(t - dur) * 6) : 1
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 1.6) * rel
    const idx = 1.6 * Math.exp(-t * 5) + 0.25
    const trem = 1 + 0.06 * Math.sin(2 * Math.PI * 4.5 * t)
    out[i] = vel * env * trem * (Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * f * t)) + 0.18 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t * 4))
  }
  return out
}
function chord(t0, notes, dur, vel) {
  notes.forEach((m, k) => add(t0 + k * 0.006, ep(hz(m), dur, vel), 0.07, (k - 1.5) * 0.25, 0.35))
}
function bass(t0, m, dur, vel = 1) {
  const n = Math.round((dur + 0.1) * SR), out = new Float32Array(n), f = hz(m)
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.min(1, t / 0.006) * (t < dur ? 1 : Math.exp(-(t - dur) * 40)) * Math.exp(-t * 0.8)
    out[i] = vel * env * Math.tanh(1.6 * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)))
  }
  add(t0, out, 0.2)
}
function kick(t0, vel = 1) {
  const n = Math.round(0.45 * SR), out = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = 45 + 75 * Math.exp(-t * 28)
    ph += 2 * Math.PI * f / SR
    out[i] = vel * Math.exp(-t * 7) * Math.sin(ph) + vel * 0.15 * rnd() * Math.exp(-t * 300)
  }
  add(t0, out, 0.32)
  const s = Math.round(t0 * SR)
  for (let i = 0; i < 0.3 * SR && s + i < N; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.35 * vel * Math.exp(-i / SR * 10))
}
function clap(t0, vel = 1) {
  const n = Math.round(0.35 * SR), raw = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = i / SR; raw[i] = rnd() * (Math.exp(-t * 22) + 0.5 * Math.exp(-Math.abs(t - 0.012) * 400)) }
  const out = biquad(raw, 'bp', 1400, 0.9)
  for (let i = 0; i < n; i++) out[i] += 0.25 * Math.sin(2 * Math.PI * 190 * i / SR) * Math.exp(-i / SR * 30)
  add(t0, out, 0.2 * vel, 0.05, 0.25)
}
function hat(t0, vel = 1, pan = 0.3) {
  const n = Math.round(0.06 * SR), raw = new Float32Array(n)
  for (let i = 0; i < n; i++) raw[i] = rnd() * Math.exp(-i / SR * 70)
  add(t0, biquad(raw, 'hp', 8000), 0.07 * vel, pan)
}
// SFX in key: tap tick (A), chime (A + E, bell FM), air swell into a cut.
function tick(t0) {
  const n = Math.round(0.08 * SR), out = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = Math.sin(2 * Math.PI * hz(81) * t) * Math.exp(-t * 60) + 0.2 * rnd() * Math.exp(-t * 500) }
  add(t0, out, 0.07, -0.1, 0.2)
}
function bell(t0, m, vel = 1, pan = 0) {
  const n = Math.round(2.2 * SR), out = new Float32Array(n), f = hz(m)
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] = vel * Math.min(1, t / 0.002) * Math.exp(-t * 2.4) * Math.sin(2 * Math.PI * f * t + 1.2 * Math.exp(-t * 3) * Math.sin(2 * Math.PI * 3.5 * f * t)) }
  add(t0, out, 0.055, pan, 0.6)
}
function air(tc, len = 0.6, vel = 1) {
  const n = Math.round((len + 0.25) * SR), raw = new Float32Array(n)
  for (let i = 0; i < n; i++) { const t = i / SR; const k = t < len ? (t / len) ** 2 : Math.exp(-(t - len) * 18); raw[i] = rnd() * k }
  const out = biquad(biquad(raw, 'lp', 2600), 'hp', 300)
  add(tc - len, out, 0.09 * vel, 0, 0.3)
}

// --- Arrangement -------------------------------------------------------------------
const PROG = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]] // Am7 Fmaj7 Cmaj7 G6
const ROOT = [45, 41, 48, 43]
for (let bar = 0; bar < 8; bar++) {
  const t = bar * BAR, c = PROG[bar % 4], r = ROOT[bar % 4]
  chord(t, c, 0.7, 1); chord(t + 0.75, c, 0.35, 0.55); chord(t + 1.5, c.slice(1), 0.4, 0.45)
  bass(t, r - 12, 0.6); bass(t + 0.75, r - 12, 0.25, 0.7); bass(t + 1.5, r, 0.35, 0.6)
  for (let e = 0; e < 8; e++) if (t + e * 0.25 >= 1) hat(t + e * 0.25, e % 2 ? 0.55 : 1, e % 2 ? 0.35 : 0.2)
  for (const [k, v] of [[0, 1], [1.0, 0.85], [1.25, 0.4]]) if (t + k >= 3) kick(t + k, v)
  for (const k of [0.5, 1.5]) if (t + k >= 3) clap(t + k)
}
kick(3.0, 0.9) // drums land on the reveal
// 16–17: E7 lift under the language wipe; 17: Am lands with the logo.
chord(16, [52, 56, 59, 62], 0.9, 1); bass(16, 40, 0.9); kick(16); clap(16.5); kick(16.5, 0.6)
for (let e = 0; e < 4; e++) hat(16 + e * 0.25, e % 2 ? 0.5 : 0.9)
chord(17, [45, 57, 60, 64, 71], 2.6, 1.1); bass(17, 33, 2.4, 1); kick(17, 1)
bell(17.0, 76, 0.7, -0.2); bell(17.5, 81, 0.55, 0.2); bell(18.0, 84, 0.4, 0)
// SFX on the edit
tick(7.0); tick(8.5)
bell(9.0, 76, 1, 0.3); bell(9.0, 81, 0.8, 0.3)
air(6.0); air(11.0, 0.5, 0.8); air(13.0, 0.45, 0.7); air(16.0, 0.5, 0.8); air(17.0, 0.8, 1)

// Reverb: 4 combs + 2 allpasses (Schroeder), per channel.
function reverb(x, off) {
  const out = new Float32Array(N)
  for (const [d, g] of [[1557, 0.84], [1617, 0.83], [1491, 0.85], [1422, 0.84]]) {
    const D = Math.round((d + off) * SR / 44100), buf = new Float32Array(D); let p = 0, lp = 0
    for (let i = 0; i < N; i++) { const y = buf[p]; lp = y * 0.6 + lp * 0.4; buf[p] = x[i] + lp * g; p = (p + 1) % D; out[i] += y * 0.25 }
  }
  for (const d of [556, 441]) {
    const D = Math.round((d + off) * SR / 44100), buf = new Float32Array(D); let p = 0
    for (let i = 0; i < N; i++) { const b = buf[p], y = -out[i] + b; buf[p] = out[i] + b * 0.5; out[i] = y; p = (p + 1) % D }
  }
  return out
}
const wl = reverb(revL, 0), wr = reverb(revR, 23)
const pcm = Buffer.alloc(N * 4)
let peak = 0
const mix = new Float32Array(N * 2)
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = t > 19.4 ? Math.max(0, (20 - t) / 0.6) : 1, inn = Math.min(1, t / 0.01)
  const d = duck[i]
  mix[2 * i] = Math.tanh((L[i] * d + wl[i] * 0.55) * 1.1) * fade * inn
  mix[2 * i + 1] = Math.tanh((R[i] * d + wr[i] * 0.55) * 1.1) * fade * inn
  peak = Math.max(peak, Math.abs(mix[2 * i]), Math.abs(mix[2 * i + 1]))
}
const g = 0.89 / peak
for (let i = 0; i < N * 2; i++) pcm.writeInt16LE(Math.round(mix[i] * g * 32767), i * 2)
const h = Buffer.alloc(44)
h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12)
h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34)
h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
writeFileSync(process.argv[2] ?? 'music.wav', Buffer.concat([h, pcm]))
console.log('peak', peak.toFixed(3), 'gain', g.toFixed(3))
