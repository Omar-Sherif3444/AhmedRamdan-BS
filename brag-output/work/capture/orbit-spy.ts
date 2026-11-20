// Records the floor's OrbitControls so the capture page can move the camera.
import { OrbitControls as Real } from '/node_modules/three/examples/jsm/controls/OrbitControls.js'
export class OrbitControls extends Real {
  constructor(...a: ConstructorParameters<typeof Real>) {
    super(...a)
    ;(window as any).__c = this
  }
}
