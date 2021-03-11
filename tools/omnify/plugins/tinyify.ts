import { Readable, Transform } from "stream"
import { minify } from "terser"
import { duplexify } from "../streams/duplexify"

class StringTransform extends Transform {
  transformFn: (s: string) => any
  string: string
  constructor(fn, opts?) {
    super(opts)
    opts = opts || {}
    this.transformFn = fn
    this.string = ""
  }

  _transform(chunk, encoding, cb) {
    this.string += chunk.toString()
    cb()
  }

  _flush(cb) {
    try {
      var transformed = this.transformFn(this.string)
      this.push(transformed)
      cb()
    }
    catch (err) {
      cb(err)
    }
  }
}

export function uglifyStream(opts) {
  var rs = new Readable({ objectMode: true })
  var stream = duplexify()

  
  stream.setWritable(
    new StringTransform((source) => {
      
      minify(source, {
        sourceMap: false,
        ...opts,
      })
        .then((minified) => {
          rs.push(minified.code)
          rs.push(null)
          //delay piping because terser minify is async, such a pain in the ass
          stream.setReadable(rs)
        })
        .catch((e) => stream.emit("error", e))
    })
  )

  return stream
}

export function tinyify(b, opts) {
  if (typeof b !== "object") {
    throw new Error("tinyify: must be used as a plugin, not a transform")
  }
  var uglifyOpts = {
    sourceMap: false,
    output: {
      ascii_only: true,
    },
    mangle: {
      safari10: true,
    },
  }

  b.pipeline.get("pack").push(uglifyStream(uglifyOpts))
}
