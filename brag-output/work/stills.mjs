import { launch, wait } from './cdp.mjs'
const out = process.argv[2]
const B = await launch(9441)
const prefs = (lang, theme) => B.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('barbershop:prefs', JSON.stringify({lang:'${lang}',theme:'${theme}'}))` })
const go = async (name, url, ready, extra = 2500) => {
  await B.send('Page.navigate', { url }); await B.until(ready); await B.js('document.fonts.ready.then(()=>1)'); await wait(extra)
  await B.shot(`${out}/${name}.png`); console.log('shot', name)
}
await prefs('ar', 'dark')
await go('public-ar', 'http://localhost:5199/?as=none#/', `document.querySelectorAll('.seat').length===7`, 4000)
await go('login-ar', 'http://localhost:5199/?as=none#/login', `!!document.querySelector('.auth form')`)
await go('floor-staff-ar', 'http://localhost:5199/?as=staff#/floor', `document.querySelectorAll('button.seat').length===7`, 4000)
await go('dash-ar', 'http://localhost:5199/?as=owner#/dashboard', `document.querySelectorAll('.kpi').length>0`, 4000)
await go('reports-ar', 'http://localhost:5199/?as=owner#/reports', `document.querySelectorAll('.kpi').length>0`)
await go('tx-ar', 'http://localhost:5199/?as=owner#/transactions', `!!document.querySelector('table')`)
await go('emp-ar', 'http://localhost:5199/?as=owner#/employees', `!!document.querySelector('.emp')`)
console.log(JSON.stringify(B.errs))
await B.close()
