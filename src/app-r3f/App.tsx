import React, { useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { MeshProps } from "@react-three/fiber/dist/declarations/src/three-types"

/**
 * try changing the colors in
 * <meshStandardMaterial color={hovered ? 'hotpink' : 'green'} />
 * to see if hmr works.
 */

function Box(props) {
  const mesh = useRef<MeshProps>()
  const [hovered, setHover] = useState(false)
  const [active, setActive] = useState(false)

  // Rotate mesh every frame, (outside of React) - the number is the speed
  useFrame(() => {
    mesh.current.rotation.x = mesh.current.rotation.y += 0.01
  })

  return (
    <mesh
      {...props}
      ref={mesh}
      //scale={active ? [1.15, 1.15, 1.15] : [1, 1, 1]}
      scale={active ? [1.5, 1.5, 1.5] : [1, 1, 1]}
      onClick={(e) => setActive(!active)}
      onPointerOver={(e) => setHover(true)}
      onPointerOut={(e) => setHover(false)}
    >
      <boxBufferGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? "hotpink" : "red"} />
    </mesh>
  )
}

export function App() {
  return (
    <Canvas>
      <ambientLight intensity={0.5} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
      <pointLight position={[-10, -10, -10]} />
      <Box position={[-1.2, 0, 0]} />
      <Box position={[1.2, 0, 0]} />
    </Canvas>
  )
}
