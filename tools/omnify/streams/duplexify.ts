import { Duplex, Readable, Writable } from "stream"
import { eos } from './eos'

//var stream = require("readable-stream")

function shift(stream) {
  var rs = stream._readableState
  if (!rs) return null
  return rs.objectMode || typeof stream._duplexState === "number" ? stream.read() : stream.read(getStateLength(rs))
}

function getStateLength(state) {
  if (state.buffer.length) {
    // Since node 6.3.0 state.buffer is a BufferList not an array
    if (state.buffer.head) {
      return state.buffer.head.data.length
    }

    return state.buffer[0].length
  }

  return state.length
}

var SIGNAL_FLUSH = Buffer.from && Buffer.from !== Uint8Array.from ? Buffer.from([0]) : Buffer.from([0])

var onuncork = function (self, fn) {
  if (self._corked) self.once("uncork", fn)
  else fn()
}

var autoDestroy = function (self, err) {
  if (self._autoDestroy) self.destroy(err)
}

var destroyer = function (self, end?) {
  return function (err) {
    if (err) autoDestroy(self, err.message === "premature close" ? null : err)
    else if (end && !self._ended) self.end()
  }
}

var end = function (ws, fn) {
  if (!ws) return fn()
  if (ws._writableState && ws._writableState.finished) return fn()
  if (ws._writableState) return ws.end(fn)
  ws.end()
  fn()
}

var noop = function () {}

var toStreams2 = function (rs) {
  return new Readable({ objectMode: true, highWaterMark: 16 }).wrap(rs)
}

class Duplexify extends Duplex {
  _writable: any
  _readable: any
  _readable2: any
  _autoDestroy: boolean
  _forwardDestroy: boolean
  _forwardEnd: boolean
  _corked: number
  _ondrain: any
  _drained: boolean
  _forwarding: boolean
  _unwrite: any
  _unread: any
  _ended: boolean
  _writableState: any
  static obj: (writable: any, readable: any, opts: any) => Duplexify
  constructor(writable, readable, opts) {
    super(opts)

    this._writable = null
    this._readable = null
    this._readable2 = null

    this._autoDestroy = !opts || opts.autoDestroy !== false
    this._forwardDestroy = !opts || opts.destroy !== false
    this._forwardEnd = !opts || opts.end !== false
    this._corked = 1 // start corked
    this._ondrain = null
    this._drained = false
    this._forwarding = false
    this._unwrite = null
    this._unread = null
    this._ended = false

    this.destroyed = false

    if (writable) this.setWritable(writable)
    if (readable) this.setReadable(readable)
  }

  cork() {
    if (++this._corked === 1) this.emit("cork")
  }

  uncork() {
    if (this._corked && --this._corked === 0) this.emit("uncork")
  }

  setWritable(writable) {
    if (this._unwrite) this._unwrite()

    if (this.destroyed) {
      if (writable && writable.destroy) writable.destroy()
      return
    }

    if (writable === null || writable === false) {
      this.end()
      return
    }

    var self = this
    var unend = eos(writable, { writable: true, readable: false }, destroyer(this, this._forwardEnd))

    var ondrain = function () {
      var ondrain = self._ondrain
      self._ondrain = null
      if (ondrain) ondrain()
    }

    var clear = function () {
      self._writable.removeListener("drain", ondrain)
      unend()
    }

    if (this._unwrite) process.nextTick(ondrain) // force a drain on stream reset to avoid livelocks

    this._writable = writable
    this._writable.on("drain", ondrain)
    this._unwrite = clear

    this.uncork() // always uncork setWritable
  }

  setReadable(readable) {
    if (this._unread) this._unread()

    if (this.destroyed) {
      if (readable && readable.destroy) readable.destroy()
      return
    }

    if (readable === null || readable === false) {
      this.push(null)
      this.resume()
      return
    }

    var self = this
    var unend = eos(readable, { writable: false, readable: true }, destroyer(this))

    var onreadable = function () {
      self._forward()
    }

    var onend = function () {
      self.push(null)
    }

    var clear = function () {
      self._readable2.removeListener("readable", onreadable)
      self._readable2.removeListener("end", onend)
      unend()
    }

    this._drained = true
    this._readable = readable
    this._readable2 = readable._readableState ? readable : toStreams2(readable)
    this._readable2.on("readable", onreadable)
    this._readable2.on("end", onend)
    this._unread = clear

    this._forward()
  }

  _read() {
    this._drained = true
    this._forward()
  }

  _forward() {
    if (this._forwarding || !this._readable2 || !this._drained) return
    this._forwarding = true

    var data

    while (this._drained && (data = shift(this._readable2)) !== null) {
      if (this.destroyed) continue
      this._drained = this.push(data)
    }

    this._forwarding = false
  }

  //   destroy(err, cb) {
  //     if (!cb) cb = noop
  //     if (this.destroyed) return cb(null)
  //     this.destroyed = true

  //     var self = this
  //     process.nextTick(function () {
  //       self._destroy(err)
  //       cb(null)
  //     })
  //   }

  _destroy(err) {
    if (err) {
      var ondrain = this._ondrain
      this._ondrain = null
      if (ondrain) ondrain(err)
      else this.emit("error", err)
    }

    if (this._forwardDestroy) {
      if (this._readable && this._readable.destroy) this._readable.destroy()
      if (this._writable && this._writable.destroy) this._writable.destroy()
    }

    this.emit("close")
  }

  _write(data, enc, cb) {
    if (this.destroyed) return
    if (this._corked) return onuncork(this, this._write.bind(this, data, enc, cb))
    if (data === SIGNAL_FLUSH) return this._finish(cb)
    if (!this._writable) return cb()

    if (this._writable.write(data) === false) this._ondrain = cb
    else if (!this.destroyed) cb()
  }

  _finish(cb) {
    var self = this
    this.emit("preend")
    onuncork(this, function () {
      end(self._forwardEnd && self._writable, function () {
        // haxx to not emit prefinish twice
        if (self._writableState.prefinished === false) self._writableState.prefinished = true
        self.emit("prefinish")
        onuncork(self, cb)
      })
    })
  }

  // @ts-ignore
  end(data?, enc?, cb?) {
    if (typeof data === "function") return this.end(null, null, data)
    if (typeof enc === "function") return this.end(data, null, enc)
    this._ended = true
    if (data) this.write(data)
    if (!this._writableState.ending) this.write(SIGNAL_FLUSH)
    return Writable.prototype.end.call(this, cb)
  }
}

Duplexify.obj = function (writable, readable, opts) {
  if (!opts) opts = {}
  opts.objectMode = true
  opts.highWaterMark = 16
  return new Duplexify(writable, readable, opts)
}

function duplexify(w?: NodeJS.WritableStream,r?: NodeJS.ReadStream, o?: any) {
  return new Duplexify(w,r,o)
}

export { Duplexify, duplexify }

