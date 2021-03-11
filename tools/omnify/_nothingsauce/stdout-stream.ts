import fs from "fs"
import { Writable } from "stream"

var exists = function (path) {
  try {
    return fs.existsSync(path)
  } catch (err) {
    return false
  }
}

function createStdoutStream() {
  var s = Object.assign(new Writable({ highWaterMark: 0 }), {
    _isStdio: true,
    isTTY: process.stdout.isTTY,
  })

  var cb
  var data
  var tries = 0
  var offset = 0

  function write() {
    fs.write(1, data, offset, data.length - offset, null, onwrite)
  }

  function onwrite(err, written) {
    if (err && err.code === "EPIPE") return cb()
    if (err && err.code === "EAGAIN" && tries++ < 30) return setTimeout(write, 10)
    if (err) return cb(err)

    tries = 0
    if (offset + written >= data.length) return cb()

    offset += written
    write()
  }

  s._write = function (_data, enc, _cb) {
    offset = 0
    cb = _cb
    data = _data
    write()
  }

  s.on("finish", function () {
    fs.close(1, function (err) {
      if (err) s.emit("error", err)
    })
  })

  return s
}

export { createStdoutStream }

