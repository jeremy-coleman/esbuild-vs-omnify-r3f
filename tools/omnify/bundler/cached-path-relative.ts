import path from "path"

var lastCwd = process.cwd()
var pathCache = Object.create(null)

function cachedPathRelative(from, to) {
  var cwd = process.cwd()
  if (cwd !== lastCwd) {
    pathCache = {}
    lastCwd = cwd
  }
  if (pathCache[from] && pathCache[from][to]) return pathCache[from][to]
  var result = path.relative.call(path, from, to)
  pathCache[from] = pathCache[from] || {}
  pathCache[from][to] = result
  return result
}

function relativePath(from, to) {
  return cachedPathRelative(from, to).replace(/\\/g, "/")
}

export { relativePath }
