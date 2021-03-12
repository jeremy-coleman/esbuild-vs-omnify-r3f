//https://jsfiddle.net/developit/h4rfc8oq/
import "three-elements"
//have to use preact/compat to get hmr to work for now, its because it registers the namesapce and Component to the hot registry,
//idk exactly how to handle it for both.
import {createElement as h, Component, render} from "preact/compat"
import {useState, useRef, useEffect} from "preact/compat"
import htm from "htm"
const html = htm.bind(h)

//try chaning color="red" to color="gold" on ~line 90 to test hmr working. it janks a little but the animation state is maintained, mission accomplished!

const make = (count, fun) => {
  const result = []
  for (let i = 0; i < count; i++) result.push(fun(i))
  return result
}

const Lights = () => html`
  <three-ambient-light intensity="0.2" />
  <three-directional-light position=${[10, 20, 30]} intensity="1.2" />
`

const Fog = () => html` <three-fog color="#222" near="16" far="40" /> `

const Cube = (props) => html`
  <three-mesh
    ...${props}
    geometry="#geometry"
    material="#material"
    tick=${(dt, {object}) => {
      /* Time */
      const t = performance.now() + object.position.z * 100 + object.position.y * 100 + object.position.x * 100

      /* Rotation */
      object.rotation.x = object.rotation.y += (1 + Math.cos(t / 200) * 0.5) * dt

      /* Scale */
      object.scale.setScalar(1 + Math.cos(t / 400) * 0.2)
    }}
  />
`

const Swarm = () => html`
  <three-group
    tick=${(dt, {object}) => {
      object.rotation.y = object.rotation.z += 0.4 * dt
    }}
  >
    ${make(10, (z) =>
      make(10, (y) =>
        make(10, (x) => html` <${Cube} position=${[(x - 5) * 2 + 1, (y - 5) * 2 + 1, (z - 5) * 2 + 1]} /> `)
      )
    )}
  </three-group>
`

// uses mouse events and preact hooks for state
function usePointerLocation(callback) {
  const cb = useRef(callback)
  cb.current = callback
  useEffect(() => {
    const move = (e) => cb.current(e)
    addEventListener("pointermove", move)
    return () => removeEventListener("pointermove", move)
  }, [])
}
const PurpleBall = () => {
  const [x, setX] = useState(2)
  const [y, setY] = useState(2)
  usePointerLocation((e) => {
    setX((e.x / window.innerWidth - 0.5) * 20)
    setY((e.y / window.innerHeight - 0.5) * -20)
  })
  return html`
    <three-mesh
      scale="1"
      position.x=${x}
      position.y=${y}
      position.z="15"
      tick=${(dt, {object}) => (object.rotation.z -= 10 * dt)}
    >
      <three-dodecahedron-buffer-geometry />
      <three-mesh-standard-material color="#673ab8" />
    </three-mesh>
  `
}

const Resources = () => html`
  <three-box-buffer-geometry id="geometry" />
  <three-mesh-standard-material id="material" color="red" metalness="0.1" roughness="0.3" />
`

const Camera = () => html` <three-perspective-camera id="camera" fov="70" position=${[0, 0, 30]} /> `

const Scene = () => html`
  <three-scene camera="#camera" background-color="#222">
    <${Resources} />
    <${Fog} />
    <${Camera} />
    <${Lights} />
    <${Swarm} />
    <${PurpleBall} />
    <three-orbit-controls />
  </three-scene>
`

const Game = () => html`
  <three-game autorender>
    <${Scene} />
  </three-game>
`

export function renderScene() {
  return render(html`<${Game} />`, document.getElementById("root"))
}
