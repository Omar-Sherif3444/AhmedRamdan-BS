import { launch, wait } from './cdp.mjs'
const go = async (B, url, ready, file, js) => { await B.send('Page.navigate', { url: 'http://localhost:5199' + url }); await B.until(ready); await wait(3500); if (js) { await B.js(js); await wait(1200) } await B.shot(file) }
let B = await launch(9811, 1440, 900)
await B.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('barbershop:prefs', '{"lang":"ar"}')` })
await go(B, '/?as=customer#/', `document.querySelectorAll('.seat').length===7`, 'chk-customer.png')
await B.js(`[...document.querySelectorAll('.seat-action .btn')][0]?.click()`); await wait(1500); await B.shot('chk-reserved.png')
await B.js(`document.querySelector('.site-footer').scrollIntoView()`); await wait(2500); await B.shot('chk-footer.png')
await go(B, '/?as=none#/login', `!!document.querySelector('.auth form')`, 'chk-login.png')
console.log(B.errs); await B.close()
B = await launch(9812, 390, 844)
await go(B, '/?as=none#/', `document.querySelectorAll('.seat').length===7`, 'chk-phone.png')
console.log(B.errs); await B.close()
