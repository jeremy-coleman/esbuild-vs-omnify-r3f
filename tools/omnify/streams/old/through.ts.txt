import { Transform } from "stream"

class DestroyableTransform extends Transform {
  _destroyed: boolean

  constructor(opts) {
    super(opts)
    this._destroyed = false
  }

  destroy(err: any) {
    if (this._destroyed) return
    this._destroyed = true
    var self = this
    process.nextTick(function () {
      if (err) self.emit("error", err)
      self.emit("close")
    })
  }
}

// a noop _transform function
function noop(chunk, enc, callback) {
  callback(null, chunk)
}

function create(construct) {
  return function (options?, transform?, flush?) {
    if (typeof options == "function") {
      flush = transform
      transform = options
      options = {}
    }

    if (typeof transform != "function") transform = noop

    if (typeof flush != "function") flush = null

    return construct(options, transform, flush)
  }
}

// main export, just make me a transform stream!
var _throughText = create(function (options, transform, flush) {
  var t2 = new DestroyableTransform(options)
  t2._transform = transform
  if (flush) t2._flush = flush
  return t2
})

let _throughObj = {
  obj: create(function (options, transform, flush) {
    var t2 = new DestroyableTransform(Object.assign({ objectMode: true, highWaterMark: 16 }, options))

    t2._transform = transform

    if (flush) t2._flush = flush

    return t2
  }),
}

let through = Object.assign(_throughText, _throughObj)

export { through }
