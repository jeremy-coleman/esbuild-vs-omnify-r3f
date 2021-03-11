import { FSWatcher, PathLike, watch } from "fs"
import path from "path"
import type { Transform } from "stream"
import { through } from "../streams"

var args = {
  cache: {},
  packageCache: {},
}

function watchify(b, opts) {
  //var watcher2 = watch(process.cwd(), {persistent: true, recursive: false})
  //watcher2.on("change", (_duh, fileName) => { console.log(fileName)})

  if (!opts) opts = {}
  var cache = b._options.cache
  var pkgcache = b._options.packageCache
  var delay = typeof opts.delay === "number" ? opts.delay : 100
  var changingDeps = {}
  var pending: boolean | NodeJS.Timeout = false
  var updating = false

  var wopts = {
    persistent: true,
    recursive: false,
  }

  if (cache) {
    b.on("reset", collect)
    collect()
  }

  function collect() {
    b.pipeline.get("deps").push(
      through.obj(function (row, enc, next) {
        var file = row.expose ? b._expose[row.id] : row.file

        cache[file] = {
          source: row.source,
          deps: row.deps,
        }
        this.push(row)
        next()
      })
    )
  }

  b.on("file", function (file: any) {
    watchFile(file)
  })

  b.on("package", function (pkg) {
    var file = path.join(pkg.__dirname, "package.json")
    watchFile(file)
    if (pkgcache) pkgcache[file] = pkg
  })

  b.on("reset", reset)
  reset()

  function reset() {
    var time = null
    var bytes = 0
    b.pipeline.get("record").on("end", function () {
      time = Date.now()
    })

    b.pipeline.get("wrap").push(through(write, end))

    function write(buf, enc, next) {
      bytes += buf.length
      this.push(buf)
      next()
    }

    function end() {
      var delta = Date.now() - time
      b.emit("time", delta)
      b.emit("bytes", bytes)
      b.emit("log", bytes + " bytes written (" + (delta / 1000).toFixed(2) + " seconds)")
      this.push(null)
    }
  }

  //object with keys of FSWatcher arrays. not sure why
  var fwatchers: { [key: string]: FSWatcher[] } = {}

  var fwatcherFiles = {}
  //var ignoredFiles = {}

  b.on("transform", function (tr: Transform, mfile: string) {
    tr.on("file", (dep) => {
      watchFile(mfile, dep)
    })
  })

  b.on("bundle", function (bundle) {
    updating = true
    bundle.on("error", onend)
    bundle.on("end", onend)
    function onend() {
      updating = false
    }
  })

  function watchFile(file: string, dep?: PathLike) {
    dep = dep || file

    // if (ignored) {
    //   if (!ignoredFiles.hasOwnProperty(file)) {
    //     ignoredFiles[file] = anymatch(ignored, file)
    //   }
    //   if (ignoredFiles[file]) return
    // }
    if (!fwatchers[file]) fwatchers[file] = []
    if (!fwatcherFiles[file]) fwatcherFiles[file] = []
    if (fwatcherFiles[file].indexOf(dep) >= 0) return

    var w = watch(file, wopts)

    w.setMaxListeners(0)
    w.on("error", b.emit.bind(b, "error"))
    w.on("change", function () {
      invalidate(file)
    })
    fwatchers[file].push(w)
    fwatcherFiles[file].push(dep)
  }

  function invalidate(id: string | number) {
    if (cache) delete cache[id]
    if (pkgcache) delete pkgcache[id]
    changingDeps[id] = true

    if (!updating && fwatchers[id]) {
      fwatchers[id].forEach(function (w: { close: () => void }) {
        w.close()
      })
      delete fwatchers[id]
      delete fwatcherFiles[id]
    }

    // wait for the disk/editor to quiet down first:
    if (pending) clearTimeout(pending as NodeJS.Timeout)
    pending = setTimeout(notify, delay)
  }

  function notify() {
    if (updating) {
      pending = setTimeout(notify, delay)
    } else {
      pending = false
      b.emit("update", Object.keys(changingDeps))
      changingDeps = {}
    }
  }

  b.close = function () {
    Object.keys(fwatchers).forEach((id) => {
      fwatchers[id].forEach((w: FSWatcher) => {
        w.close()
      })
    })
  }

  return b
}

export { watchify, args }

