//https://github.com/goto-bus-stop/deps-transform/blob/master/index.js
import { resolve } from "../bundler/resolve"
import { concat } from "../streams/concat"
import { fromString } from "../streams/fromString"
import { pump } from "../streams/pump"
import { through } from "../streams/through"


//transformName can be a npm package string or the actual function, just like b.transform
function depsTransform(transformName, opts) {
  var basedir = process.cwd()
  var transform = typeof transformName === "function" ? transformName : null
  
  if (!transform) {
    var transformPath = resolve.sync(transformName, { basedir: basedir })
    transform = require(transformPath)
  }

  return through.obj(onrow)

  function onrow(row, enc, next) {
    pump(
      fromString(row.source),
      transform(row.file || row.id + ".js", opts),
      concat({ encoding: "string" }, function (source) {
        row.source = source
        next(null, row)
      }),
      function (err) {
        if (err) next(err)
      }
    )
  }
}

export { depsTransform }
