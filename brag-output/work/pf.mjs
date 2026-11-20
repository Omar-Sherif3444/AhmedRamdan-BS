import { launch, wait } from './cdp.mjs'
for (const [w, h, name] of [[1440, 900, 'pf-desk'], [390, 844, 'pf-phone']]) {
  const B = await launch(9850 + w % 7, w, h)
  await B.send('Page.navigate', { url: 'http://localhost:4321/#projects' })
  await B.until(`!!document.querySelector('#projects article')`, 20000)
  await B.js(`document.querySelector('#projects article').scrollIntoView(); scrollBy(0, -40)`)
  await wait(2500)
  await B.shot(`${name}.png`)
  console.log(name, B.errs)
  await B.close()
}
