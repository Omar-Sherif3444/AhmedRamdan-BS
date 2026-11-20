// node render.mjs stills 0.5,3.5,...   → comp stills into stills/
// node render.mjs frames               → all 600 frames into frames/
import { launch } from './cdp.mjs'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const [mode, list] = process.argv.slice(2)
const B = await launch(9620, 1920, 1080)
await B.send('Page.navigate', { url: pathToFileURL(resolve('comp/index.html')).href })
await B.until('!!window.ready'); await B.js('window.ready')
const shoot = async (t, file) => { await B.js(`render(${t})`); await B.shot(file, { format: 'jpeg', quality: 95 }) }
if (mode === 'stills') {
  mkdirSync('stills', { recursive: true })
  for (const t of list.split(',').map(Number)) { await shoot(t, `stills/t${t.toFixed(2)}.jpg`); console.log('still', t) }
} else {
  mkdirSync('frames', { recursive: true })
  for (let f = 0; f < 600; f++) {
    await shoot(f / 30, `frames/f${String(f).padStart(3, '0')}.jpg`)
    if (f % 60 === 0) console.log('frame', f)
  }
}
console.log('errors', JSON.stringify(B.errs))
await B.close()
