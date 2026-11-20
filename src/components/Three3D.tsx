import { useEffect, useRef, useState, type DependencyList, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { useStore } from '../store'
import { Columns, type Point } from './Charts'
import type { Seat, SeatStatus } from '../types'

const css = (name: string) => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim())

export const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
})()

interface Stage {
  el: HTMLDivElement
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  render: () => void
  /** Meshes under the pointer, given client coordinates. */
  pick: (x: number, y: number, objects: THREE.Object3D[]) => THREE.Intersection[]
}

/** One WebGL scene that renders on demand (no animation loop) and cleans up fully on rebuild. */
function useStage(ref: RefObject<HTMLDivElement | null>, height: number, setup: (s: Stage) => void, deps: DependencyList) {
  useEffect(() => {
    const el = ref.current
    if (!el || !hasWebGL) return
    const w = el.clientWidth || 600
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(w, height)
    const labels = new CSS2DRenderer()
    labels.setSize(w, height)
    labels.domElement.className = 'three-labels'
    el.append(renderer.domElement, labels.domElement)

    renderer.toneMapping = THREE.ACESFilmicToneMapping
    const scene = new THREE.Scene()
    // A soft studio environment so chrome, brass and leather pick up reflections.
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.8))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(4, 10, 8)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(38, w / height, 0.1, 200)

    // Rotate around the vertical axis only, so vertical swipes still scroll the page on phones.
    const controls = new OrbitControls(camera, labels.domElement)
    controls.enablePan = false
    controls.enableZoom = false
    labels.domElement.style.touchAction = 'pan-y'

    const render = () => {
      renderer.render(scene, camera)
      labels.render(scene, camera)
    }
    const ray = new THREE.Raycaster()
    const pick = (x: number, y: number, objects: THREE.Object3D[]) => {
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera)
      return ray.intersectObjects(objects, true)
    }

    setup({ el, renderer, sun, scene, camera, controls, render, pick })
    controls.update()
    const polar = controls.getPolarAngle()
    controls.minPolarAngle = controls.maxPolarAngle = polar
    controls.minAzimuthAngle = -0.8
    controls.maxAzimuthAngle = 0.8
    controls.addEventListener('change', render)
    render()

    const ro = new ResizeObserver(([e]) => {
      const width = e.contentRect.width
      if (!width) return
      renderer.setSize(width, height)
      labels.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      controls.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
        }
      })
      scene.environment?.dispose()
      renderer.dispose()
      el.replaceChildren()
    }
  }, deps)
}

function label(text: string, className = 'three-label') {
  const div = document.createElement('div')
  div.className = className
  div.textContent = text
  return new CSS2DObject(div)
}

/** 3D bar chart. Falls back to the 2D columns chart without WebGL. */
export function Bars3D({ data, format, label: aria, height = 260 }: { data: Point[]; format: (n: number) => string; label: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const { i18n } = useStore()
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null)

  useStage(
    ref,
    height,
    ({ el, scene, camera, controls, render, pick }) => {
      const n = data.length
      const span = 14
      const step = span / Math.max(n, 1)
      const bw = step * 0.72
      const max = Math.max(1, ...data.map((d) => d.value))
      const accent = css('--accent')
      const hot = accent.clone().offsetHSL(0, 0.05, -0.08)
      const geo = new THREE.BoxGeometry(bw, 1, Math.min(bw, 1.2))
      const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.min(8, Math.floor(el.clientWidth / 80)))))

      const floor = new THREE.Mesh(new THREE.BoxGeometry(span + 1, 0.08, 2.4), new THREE.MeshStandardMaterial({ color: css('--surface-2') }))
      floor.position.y = -0.04
      scene.add(floor)

      const bars = data.map((d, i) => {
        const h = Math.max(0.03, (d.value / max) * 5)
        const bar = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45, metalness: 0.2 }))
        bar.scale.y = h
        // Time and ranking read in the page direction: right-to-left in Arabic.
        const slot = i18n.dir === 'rtl' ? n - 1 - i : i
        bar.position.set(-span / 2 + step * (slot + 0.5), h / 2, 0)
        bar.userData.i = i
        scene.add(bar)
        if (i % labelEvery === 0) {
          const l = label(d.label)
          l.position.set(bar.position.x, -0.35, 1.1)
          scene.add(l)
        }
        return bar
      })

      // Back the camera off on narrow cards so all bars fit.
      const fit = Math.max(1, 1.7 / (el.clientWidth / height))
      camera.position.set(0, 6.5 * fit, 13 * fit)
      controls.target.set(0, 1.6, 0)

      let hover: THREE.Mesh | null = null
      el.onpointermove = (e) => {
        const hit = pick(e.clientX, e.clientY, bars)[0]?.object as THREE.Mesh | undefined
        if (hit !== hover) {
          if (hover) (hover.material as THREE.MeshStandardMaterial).color.copy(accent)
          if (hit) (hit.material as THREE.MeshStandardMaterial).color.copy(hot)
          hover = hit ?? null
          render()
        }
        const r = el.getBoundingClientRect()
        setTip(hit ? { x: e.clientX - r.left, y: e.clientY - r.top, i: hit.userData.i as number } : null)
      }
      el.onpointerleave = () => {
        if (hover) (hover.material as THREE.MeshStandardMaterial).color.copy(accent)
        hover = null
        setTip(null)
        render()
      }
    },
    [data, i18n, height],
  )

  if (!hasWebGL) return <Columns data={data} format={format} label={aria} height={height - 40} />
  return (
    <div className="three-wrap" style={{ height }}>
      <div ref={ref} className="three" role="img" aria-label={aria} />
      {tip && (
        <div className="tip" style={{ left: tip.x, top: Math.max(0, tip.y - 56) }}>
          <span className="muted">{data[tip.i].label}</span>
          <strong>{format(data[tip.i].value)}</strong>
        </div>
      )}
      <ul className="sr-only">
        {data.map((d, i) => (
          <li key={i}>
            {d.label}: {format(d.value)}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Leather tones per status: rich and readable on the light theme (labels keep the UI status colours).
const LEATHER: Record<SeatStatus, number> = { available: 0x2f8f5b, occupied: 0xa3262a, reserved: 0xc58a1c, out_of_service: 0x77706b }

/** Live 3D model of the shop: the sofa's three seats facing the four barber chairs. */
/** Without onSelect seats can't be tapped; the label shows who reserved a seat online. */
export function Floor3D({ height = 340, onSelect }: { height?: number; onSelect?: (seatId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Latest callback without rebuilding the scene when the parent re-renders.
  const select = useRef(onSelect)
  select.current = onSelect
  const interactive = !!onSelect
  const { state, i18n } = useStore()
  const { seats } = state

  useStage(
    ref,
    height,
    ({ el, renderer, sun, scene, camera, controls, render, pick }) => {
      // Softer studio light so the leather keeps its deep colour instead of washing out.
      scene.environmentIntensity = 0.45
      renderer.toneMappingExposure = 0.8
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 })

      // Materials: status-coloured leather, polished chrome, brushed brass, velvet upholstery.
      const leather = (color: THREE.Color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4 })
      const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.12 })
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.28 })
      const black = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.45 })
      const velvet = new THREE.MeshStandardMaterial({ color: 0x3b3431, roughness: 0.92 })
      const glass = new THREE.MeshStandardMaterial({ color: 0xd8e4ee, metalness: 1, roughness: 0.04 })
      const wood = new THREE.MeshStandardMaterial({ color: 0x8a6446, roughness: 0.55 })

      const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
        const mesh = new THREE.Mesh(geo, m)
        mesh.position.set(x, y, z)
        mesh.rotation.x = rx
        mesh.castShadow = true
        mesh.receiveShadow = true
        return mesh
      }
      const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 4, r)
      const cyl = (top: number, bottom: number, h: number) => new THREE.CylinderGeometry(top, bottom, h, 40)

      const side = i18n.dir === 'rtl' ? -1 : 1 // number seats in reading order
      const clickable: THREE.Object3D[] = []

      // Room: warm wood floor, back wall with skirting, rug under the waiting sofa.
      const floor = part(new THREE.BoxGeometry(14, 0.1, 9), new THREE.MeshStandardMaterial({ color: 0xd8c8b4, roughness: 0.7 }), 0, -0.05, 0)
      floor.castShadow = false
      scene.add(floor)
      scene.add(part(new THREE.BoxGeometry(14, 3.6, 0.15), new THREE.MeshStandardMaterial({ color: css('--surface'), roughness: 0.9 }), 0, 1.8, -4.45))
      scene.add(part(new THREE.BoxGeometry(14, 0.18, 0.06), wood, 0, 0.09, -4.35))
      scene.add(part(rbox(7.4, 0.03, 3.1, 0.01), new THREE.MeshStandardMaterial({ color: 0xb9a58a, roughness: 1 }), 0, 0.015, 2.75))

      // Narrow screens: name only (colour carries the status) so the seven labels don't collide.
      const narrow = el.clientWidth < 600
      const seatLabel = (s: Seat) => {
        const extra = narrow ? '' : i18n.t(`seat.${s.status}`)
        return label(extra ? `${i18n.seatName(s)} · ${extra}` : i18n.seatName(s), `three-label seat-label s-${s.status}`)
      }
      const skins = new Map<string, THREE.MeshPhysicalMaterial>()

      for (const s of seats) {
        const skin = leather(new THREE.Color(LEATHER[s.status]))
        skins.set(s.id, skin)
        const g = new THREE.Group()
        if (s.kind === 'chair') {
          // Classic hydraulic barber chair, facing the room with its back to the mirror.
          const x = side * (-4.8 + (s.number - 1) * 3.2)
          g.add(part(cyl(0.55, 0.62, 0.08), chrome, 0, 0.04, 0))
          g.add(part(cyl(0.11, 0.13, 0.5), chrome, 0, 0.32, 0))
          g.add(part(cyl(0.3, 0.22, 0.14), chrome, 0, 0.62, 0))
          g.add(part(rbox(1.2, 0.12, 1.08, 0.05), black, 0, 0.74, 0))
          g.add(part(rbox(1.08, 0.24, 0.98, 0.1), skin, 0, 0.9, 0.02))
          g.add(part(rbox(1.08, 1.05, 0.22, 0.1), skin, 0, 1.5, -0.47, -0.16))
          g.add(part(cyl(0.03, 0.03, 0.22), chrome, 0, 2.06, -0.58))
          g.add(part(rbox(0.52, 0.22, 0.16, 0.07), skin, 0, 2.2, -0.6, -0.16))
          for (const ax of [-0.64, 0.64]) {
            g.add(part(rbox(0.17, 0.11, 0.9, 0.05), black, ax, 1.2, 0.02))
            g.add(part(cyl(0.03, 0.03, 0.4), chrome, ax, 0.97, 0.32))
            g.add(part(cyl(0.03, 0.03, 0.4), chrome, ax, 0.97, -0.28))
          }
          g.add(part(rbox(0.06, 0.06, 0.6, 0.02), chrome, 0, 0.56, 0.72, 0.75))
          g.add(part(rbox(0.85, 0.05, 0.32, 0.02), chrome, 0, 0.34, 0.95))
          g.position.set(x, 0, -2.1)

          // Gold-framed mirror above a small wooden counter.
          scene.add(part(rbox(1.75, 2.25, 0.08, 0.04), brass, x, 2.05, -4.32))
          scene.add(part(new THREE.BoxGeometry(1.58, 2.08, 0.02), glass, x, 2.05, -4.27))
          scene.add(part(rbox(2.1, 0.08, 0.5, 0.03), wood, x, 0.95, -4.12))
          const l = seatLabel(s)
          l.position.set(0, 2.65, 0)
          g.add(l)
        } else {
          // One seat of the waiting sofa (facing the viewer): a deep seat cushion and a reclined back cushion.
          const x = side * ((s.number - 2) * 1.95)
          g.add(part(rbox(1.9, 0.28, 1.25, 0.12), skin, 0, 0.72, 0.08))
          g.add(part(rbox(1.86, 0.86, 0.32, 0.14), skin, 0, 1.2, -0.55, -0.14))
          g.position.set(x, 0, 2.8)
          const l = seatLabel(s)
          l.position.set(0, s.number === 2 ? 2.5 : 1.9, 0) // raise the middle label so the three don't overlap
          g.add(l)
        }
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) o.userData.seatId = s.id
        })
        clickable.push(g)
        scene.add(g)
      }

      // Sofa frame: velvet base and back, rolled arms, tapered brass legs.
      const sofa = new THREE.Group()
      sofa.add(part(rbox(6.15, 0.44, 1.5, 0.12), velvet, 0, 0.4, 0))
      sofa.add(part(rbox(6.15, 1.1, 0.3, 0.12), velvet, 0, 1.05, -0.74))
      for (const ax of [-3.1, 3.1]) {
        sofa.add(part(rbox(0.36, 0.62, 1.5, 0.12), velvet, ax, 0.63, 0))
        sofa.add(part(cyl(0.22, 0.22, 1.5), velvet, ax, 0.97, 0, Math.PI / 2))
      }
      for (const [lx, lz] of [[-2.95, -0.6], [2.95, -0.6], [-2.95, 0.65], [2.95, 0.65]]) sofa.add(part(cyl(0.06, 0.035, 0.2), brass, lx, 0.1, lz))
      sofa.position.set(0, 0, 2.8)
      scene.add(sofa)

      const fit = Math.max(1, 1.6 / (el.clientWidth / height))
      camera.position.set(0, 9 * fit, 11 * fit)
      controls.target.set(0, 0.6, 0)

      let down = { x: 0, y: 0 }
      if (!interactive) return render()
      el.onpointerdown = (e) => (down = { x: e.clientX, y: e.clientY })
      // Light up the leather of the seat under the pointer.
      let hover: string | undefined
      const highlight = (id: string | undefined) => {
        if (id === hover) return
        if (hover) skins.get(hover)?.emissive.setHex(0)
        if (id) skins.get(id)?.emissive.setHex(0x3a3a3a)
        hover = id
        el.style.cursor = id ? 'pointer' : 'grab'
        render()
      }
      el.onpointermove = (e) => highlight(pick(e.clientX, e.clientY, clickable)[0]?.object.userData.seatId)
      el.onpointerleave = () => highlight(undefined)
      el.onpointerup = (e) => {
        // A drag rotates the view; only a tap opens the seat.
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
        const id = pick(e.clientX, e.clientY, clickable)[0]?.object.userData.seatId
        if (id) select.current?.(id)
      }
      render()
    },
    [seats, i18n, height, interactive],
  )

  if (!hasWebGL) return null
  return (
    <div className="three-wrap" style={{ height }}>
      <div ref={ref} className="three" role="img" aria-label={seats.map((s) => `${i18n.seatName(s)}: ${i18n.t(`seat.${s.status}`)}`).join(', ')} />
    </div>
  )
}
