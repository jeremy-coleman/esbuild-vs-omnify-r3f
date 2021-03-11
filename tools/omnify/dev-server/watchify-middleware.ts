import { EventEmitter } from "events"
import { watchify as createWatchify } from "../bundler/watchify"
import { concat } from "../streams/concat"

var ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-PRZcf-nqry=><]/g

function stripAnsi(str) {
  return typeof str === "string" ? str.replace(ansiRegex, "") : str
}

function debounce(func, wait, immediate = false) {
  var timeout
  return function () {
    var context = this
    var args = arguments
    var later = function () {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    var callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func.apply(context, args)
  }
}

// parses a syntax error for pretty-printing to console
function parseError(err) {
  // babelify@6.x
  if (err.codeFrame) {
    return [err.message, err.codeFrame].join("\n\n")
  }
  // babelify@5.x and browserify
  else {
    return err.annotated || err.message
  }
}

function createBundler(browserify, opt) {
  opt = opt || {}
  var emitter = new EventEmitter()
  var delay = opt.delay || 0
  var closed = false
  var pending = false
  var time = Date.now()
  var updates = []
  var errorHandler = opt.errorHandler
  if (errorHandler === true) {
    errorHandler = defaultErrorHandler
  }

  var watchify = createWatchify(
    browserify,
    Object.assign({}, opt, {
      // we use our own debounce, so make sure watchify
      // ignores theirs
      delay: 0
    })
  )

  var contents = null

  //8 years later, still cant assign to local vars, cool.
  //@ts-ignore 
  emitter.close = function () {
    if (closed) return
    closed = true
    if (watchify) {
      // needed for watchify@3.0.0
      // this needs to be revisited upstream
      setTimeout(function () {
        watchify.close()
      }, 200)
    }
  }

  var bundleDebounced = debounce(bundle, delay)

  watchify.on("update", function (rows) {
    if (closed) return
    updates = rows
    pending = true
    time = Date.now()
    emitter.emit("pending", updates)
    bundleDebounced()
  })

  //@ts-ignore
  emitter.bundle = function () {
    if (closed) return
    time = Date.now()
    if (!pending) {
      pending = true
      process.nextTick(function () {
        emitter.emit("pending", updates)
      })
    }
    bundle()
  }

  // initial bundle
  if (opt.initialBundle !== false) {
    //@ts-ignore
    emitter.bundle()
  }

  return emitter

  function bundle() {
    if (closed) {
      update()
      return
    }

    var didError = false

    var outStream = concat(function (body) {
      if (!didError) {
        contents = body

        var delay = Date.now() - time
        emitter.emit("log", {
          contentLength: contents.length,
          elapsed: Math.round(delay),
          level: "info",
          type: "bundle"
        })

        update()
      }
    })

    var wb = watchify.bundle()
    // it can be nice to handle errors gracefully
    if (typeof errorHandler === "function") {
      wb.once("error", function (err) {
        err.message = parseError(err)
        contents = errorHandler(err) || ""

        didError = true
        emitter.emit("bundle-error", err)

        update()
      })
    } else {
      wb.once("error", function (err) {
        err.message = parseError(err)
        emitter.emit("error", err)
        emitter.emit("bundle-error", err)
      })
    }
    wb.pipe(outStream)

    function bundleEnd() {
      update()
    }
  }

  function update() {
    if (closed) return
    if (pending) {
      pending = false
      emitter.emit("update", contents, updates)
      updates = []
    }
  }
}

function defaultErrorHandler(err) {
  console.error("%s", err)
  var msg = stripAnsi(err.message)
  return ";console.error(" + JSON.stringify(msg) + ");"
}

function createEmitter(browserify, opt) {
  var bundler = createBundler(browserify, opt) as ReturnType<typeof createBundler> & {middleware: (req, res) => void}
  var pending = false
  var contents = ""

  bundler.on("pending", function () {
    pending = true
  })

  bundler.on("update", function (data) {
    pending = false
    contents = data
  })

  bundler.middleware = function middleware(req, res) {
    if (pending) {
      bundler.emit("log", {
        level: "debug",
        type: "request",
        message: "bundle pending"
      })

      bundler.once("update", function () {
        bundler.emit("log", {
          level: "debug",
          type: "request",
          message: "bundle ready"
        })
        submit(req, res)
      })
    } else {
      submit(req, res)
    }
  }

  return bundler

  function submit(req, res) {
    res.setHeader("content-type", "application/javascript; charset=utf-8")
    res.setHeader("content-length", contents.length)
    res.statusCode = req.statusCode || 200
    res.end(contents)
  }
}

function watchifyMiddleware(browserify, opt) {
  return createEmitter(browserify, opt).middleware
}

export default watchifyMiddleware

export { createEmitter as emitter }

