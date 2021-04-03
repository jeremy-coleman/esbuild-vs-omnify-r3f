import React from "react"
import { render } from "react-dom"
import { App } from "./App"

console.log(__dirname)
console.log(__filename)
console.log(process.env.NODE_ENV)
console.log(global)

export function renderScene() {
  return render(<App />, document.getElementById("root"))
}
