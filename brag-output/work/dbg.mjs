import { launch, wait } from './cdp.mjs'
const B = await launch(9777, 1920, 1080)
await B.send('Page.navigate', { url: 'http://localhost:5199/brag-output/work/capture/floor.html?as=none' })
await B.until('!!window.__c'); await wait(2000)
console.log(await B.js(`(async () => { try { const c = __c; const before = c.object.position.toArray(); await __orbit(0.6, 1.2); return JSON.stringify({ before, after: c.object.position.toArray(), az: c.getAzimuthalAngle(), n: document.querySelectorAll('canvas').length }) } catch (e) { return 'ERR ' + e.message } })()`))
await wait(500); await B.shot('dbg.png')
console.log(B.errs); await B.close()
