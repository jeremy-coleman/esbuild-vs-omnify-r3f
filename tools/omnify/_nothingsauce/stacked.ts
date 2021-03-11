//https://github.com/fgnass/stacked/blob/master/stacked.js

import { parse } from "url"

function stacked(...layers) {
  function handle(req, res, out) {
    var i = 0
    function next(err?) {
      var layer = handle.layers[i++]

      if (!layer || res.headersSent) {
        // all done
        if (out) return out(err) // delegate to parent

        if (err && res.statusCode < 400) res.statusCode = err.status || 500
        else res.statusCode = 404

        return res.end()
      }

      try {
        layer(req, res, next)
      } catch (e) {
        next(e)
      }
    }
    next()
  }

  handle.layers = layers
  //handle.layers = Array.prototype.slice.call(arguments)

  handle.use = function use(fn) {
    if (typeof fn == "object" && fn.handle) fn = fn.handle.bind(fn)
    handle.layers.push(fn)
    return this
  }

  handle.mount = function mount(path, fn) {
    return this.use(sub(path, fn))
  }

  return handle
}

function sub(mount, fn) {
  if (mount.substr(-1) != "/") mount += "/"
  if (typeof fn == "object" && fn.handle) fn = fn.handle.bind(fn)

  return function (req, res, next) {
    var url = req.url
    var uri = req.uri

    if (url.substr(0, mount.length) !== mount && url.substr(0, mount.length) + "/" !== mount) return next()

    // modify the URL
    if (!req.realUrl) req.realUrl = url

    req.url = url.substr(mount.length - 1)
    if (req.uri) req.uri = parse(req.url)

    fn(req, res, function (err) {
      // reset the URL
      req.url = url
      req.uri = uri
      next(err)
    })
  }
}

export { stacked }
