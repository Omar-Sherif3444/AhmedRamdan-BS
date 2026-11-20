// Tiny CDP driver for headless Edge.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
export const wait = (ms) => new Promise((r) => setTimeout(r, ms))
export async function launch(port, w = 1920, h = 1080, extra = []) {
  const prof = mkdtempSync(join(tmpdir(), 'edge-'))
  const proc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${w},${h}`,
    '--hide-scrollbars', '--force-device-scale-factor=1', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', ...extra, 'about:blank'], { stdio: 'ignore' })
  let list
  for (let i = 0; i < 50; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await wait(200) } }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let n = 0; const p = new Map(); const errs = []
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description?.slice(0, 300)); p.get(m.id)?.(m) })
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; p.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
  const js = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 800 })
  const until = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await wait(150) } return false }
  const shot = async (file, opts = {}) => writeFileSync(file, Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...opts })).result.data, 'base64'))
  const close = async () => { try { await Promise.race([send('Browser.close'), wait(1500)]) } catch {} proc.kill() }
  return { send, js, until, shot, errs, close }
}
