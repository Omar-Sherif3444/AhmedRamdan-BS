// Renders the 3D sweep in chunks of 40 frames (fresh browser each), skipping frames already done.
import { launch, wait } from './cdp.mjs'
import { existsSync } from 'node:fs'
const N = 240, CH = 40, PAD = (i) => `orbit/g${String(i).padStart(3, '0')}.png`
const timeout = (p, ms) => Promise.race([p, wait(ms).then(() => { throw new Error('timeout') })])
for (let a = 0; a <= N; a += CH) {
  const todo = [...Array(Math.min(CH, N + 1 - a)).keys()].map((k) => a + k).filter((i) => !existsSync(PAD(i)))
  if (!todo.length) continue
  const B = await launch(9700 + a, 1920, 1080, ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'])
  try {
    await B.send('Page.navigate', { url: 'http://localhost:5199/brag-output/work/capture/floor.html?as=none' })
    if (!(await B.until('!!window.__c', 30000))) throw new Error('no controls')
    await B.js('document.fonts.ready.then(() => 1)'); await wait(800)
    for (const i of todo) {
      const t = i / N, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      await timeout(B.js(`__orbit(${0.55 - 1.1 * e}, ${1.22 - 0.1 * e})`), 10000); await wait(120)
      await timeout(B.shot(PAD(i)), 20000)
    }
    console.log('chunk', a, 'ok')
  } catch (err) { console.log('chunk', a, err.message) }
  await B.close()
}
