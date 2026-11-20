// Full-screen Floor3D for filming; window.__orbit(azimuth, distanceScale) moves the camera.
import { createRoot } from 'react-dom/client'
import { StoreProvider, useStore } from '/src/store.tsx'
import { Floor3D } from '/src/components/Three3D.tsx'
import '/src/styles.css'

;(window as any).__orbit = (az: number, k = 1) => {
  const c = (window as any).__c
  if (!c.__base) c.__base = { r: c.object.position.distanceTo(c.target), polar: c.getPolarAngle() }
  const r = c.__base.r * k, p = c.__base.polar
  c.minAzimuthAngle = -Infinity
  c.maxAzimuthAngle = Infinity
  c.object.position.set(c.target.x + r * Math.sin(p) * Math.sin(az), c.target.y + r * Math.cos(p), c.target.z + r * Math.sin(p) * Math.cos(az))
  c.object.lookAt(c.target)
  c.update()
  c.dispatchEvent({ type: 'change' })
  return 1
}
function Stage() {
  const { status } = useStore()
  return status === 'ready' ? <Floor3D height={innerHeight} /> : null
}
createRoot(document.getElementById('root')!).render(<StoreProvider><Stage /></StoreProvider>)
