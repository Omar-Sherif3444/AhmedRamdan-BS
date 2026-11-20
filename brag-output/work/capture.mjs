import { launch, wait } from './cdp.mjs'
import { writeFileSync } from 'node:fs'
const out = 'shots'
const CLOCK = `(() => { const D = Date, off = new D(2026, 9, 26, 19, 30).getTime() - D.now();
  class FD extends D { constructor(...a) { a.length ? super(...a) : super(D.now() + off) } static now() { return D.now() + off } }
  window.Date = FD })()`
const meta = {}
async function page(w, h, dsf, lang) {
  const B = await launch(9450 + Math.floor(Math.random() * 400), w, h)
  await B.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: w < 800 })
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK })
  await B.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('barbershop:prefs', JSON.stringify({lang:'${lang}',theme:'dark'}))` })
  B.go = async (url, ready, extra = 2500) => { await B.send('Page.navigate', { url: 'http://localhost:5199' + url }); await B.until(ready); await B.js('document.fonts.ready.then(()=>1)'); await wait(extra) }
  return B
}
const rect = (B, expr) => B.js(`(() => { const r = (${expr}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`)
const CH3 = `[...document.querySelectorAll('button.seat')].find(x => /كرسي ٣|Chair 3/.test(x.textContent))`
const which = process.argv[2] ?? 'all'

if (which === 'all' || which === 'orbit') {
  const B = await page(1920, 1080, 1, 'ar')
  await B.go('/brag-output/work/capture/floor.html?as=none', `!!document.querySelector('.three canvas')`, 3000)
  if (!(await B.until('!!window.__c', 30000))) throw new Error('no controls')
  const N = +(process.argv[3] ?? 240)
  for (let i = 0; i <= N; i++) {
    const t = i / N, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2 // ease in-out
    const t0 = Date.now()
    await B.js(`__orbit(${0.55 - 1.1 * e}, ${1.22 - 0.1 * e})`); await wait(120)
    await B.shot(`orbit/f${String(i).padStart(3, '0')}.png`)
    if (i % 20 === 0) console.log(i, Date.now() - t0, 'ms')
  }
  console.log('orbit', B.errs); await B.close()
}

if (which === 'all' || which === 'ui') {
  if (process.argv[3] !== 'phone') {
  if (process.argv[3] !== 'en') {
  var B = await page(1920, 1080, 1, 'ar')
  await B.go('/?as=none#/', `document.querySelectorAll('.seat').length===7`, 4000); await B.shot(`${out}/public-ar.png`)
  await B.go('/?as=owner#/dashboard', `document.querySelectorAll('.kpi').length>0`, 5000); await B.shot(`${out}/dash-ar.png`)
  await B.go('/?as=owner#/reports', `document.querySelectorAll('.kpi').length>0`, 3000); await B.shot(`${out}/reports-ar.png`)
  // The check-in: the barber taps Chair 3, types the walk-in's name, saves.
  await B.go('/?as=staff#/floor', `document.querySelectorAll('button.seat').length===7`, 4000)
  await B.js(`scrollTo(0, 420)`); await wait(800)
  await B.shot(`${out}/checkin-0.png`); meta.ch3 = await rect(B, CH3)
  await B.js(`${CH3}.click()`); await B.until(`!!document.querySelector('dialog[open] form')`); await wait(700)
  await B.shot(`${out}/checkin-1.png`)
  const set = (sel, v) => B.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await set('dialog[open] form input', 'أحمد سمير'); await set('dialog[open] form input[inputmode=decimal]', '170'); await B.js(`document.activeElement.blur()`); await wait(300)
  await B.shot(`${out}/checkin-2.png`)
  meta.submit = await rect(B, `document.querySelector('dialog[open] form button[type=submit]')`)
  await B.js(`document.querySelector('dialog[open] form button[type=submit]').click()`); await wait(1500)
  await B.shot(`${out}/checkin-3.png`)
  console.log('ui-ar', B.errs); await B.close()

  }
  B = await page(1920, 1080, 1, 'en')
  await B.go('/?as=owner#/dashboard', `document.querySelectorAll('.kpi').length>0`, 5000); await B.shot(`${out}/dash-en.png`)
  await B.go('/?as=none#/', `document.querySelectorAll('.seat').length===7`, 4000); await B.shot(`${out}/public-en.png`)
  console.log('ui-en', B.errs); await B.close()

  }
  if (process.argv[3] !== 'ar') {
  B = await page(390, 844, 2, 'ar')
  await B.go('/?as=none#/', `document.querySelectorAll('.seat').length===7`, 4000); await B.shot(`${out}/phone-before.png`)
  await B.go('/?as=none&busy=c3#/', `document.querySelectorAll('.seat').length===7`, 4000); await B.shot(`${out}/phone-after.png`)
  console.log('phone', B.errs); await B.close()
  }
  writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 1))
}
