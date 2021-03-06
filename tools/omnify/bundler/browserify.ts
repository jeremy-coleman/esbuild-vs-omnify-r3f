//https://github.com/browserify/browserify

import { EventEmitter } from "events"
import fs from "fs"
import { builtinModules } from "module"
import path from "path"
import { ConcatStream, LabeledStreamSplicer, ReadOnlyStream, through } from "../streams"
import { browserPack } from "./browser-pack"
import { relativePath } from "./cached-path-relative"
import { depsSort } from "./deps-sort"
import { insertModuleGlobals } from "./insert-globals"
import { ModuleDeps, ModuleDepsOptions } from "./module-deps"
import { bresolve, resolve } from "./resolve"
import { shasum } from "./shasum"

var paths = {
  empty: null
}

var isArray = Array.isArray

function defined(...args) {
  for (var i = 0; i < args.length; i++) {
    if (args[i] !== undefined) return args[i]
  }
}

var hasOwnProperty = Object.prototype.hasOwnProperty

function xtend(...args) {
  var target = {}
  for (var i = 0; i < args.length; i++) {
    var source = args[i]
    for (var key in source) {
      if (hasOwnProperty.call(source, key)) {
        target[key] = source[key]
      }
    }
  }
  return target
}

const TERMINATORS_LOOKUP = {
  "\u2028": "\\u2028",
  "\u2029": "\\u2029"
}

const sanitize = (str) => str.replace(/[\u2028\u2029]/g, (v) => TERMINATORS_LOOKUP[v])

function checkSyntax(src, file, opts?) {
  if (typeof src !== "string") src = String(src)
  try {
    eval('throw "STOP"; (function () { ' + src + "\n})()")
    return
  } catch (err) {
    if (err === "STOP") return undefined
    if (err.constructor.name !== "SyntaxError") return err
    return err
  }
}

type BrowserifyMdepsOptions = Partial<{
  basedir: any
  transformKey: any
  postFilter: (arg0: any, arg1: any, arg2: any) => any
  filter: (arg0: any) => any
  bundleExternal: boolean
  preserveSymlinks: any
  node: any
  bare: any
  target: string
  debug: any
  insertGlobals: any
  commondir: boolean
  builtins: any
}>

type BrowserifyOptions = {
  entries?: any
  node?: any
  bare?: any
  browserField?: any
  builtins?: any
  commondir?: any
  insertGlobalVars?: any
  noparse?: any
  noParse?: any
  basedir?: any
  dedupe?: any
  ignoreTransform?: any
  transform?: any
  require?: any
  plugin?: any
}

class Browserify extends EventEmitter {
  _options: any
  _external: any[]
  _exclude: any[]
  _ignore: any[]
  _expose: {}
  _hashes: {}
  _pending: number
  _transformOrder: number
  _transformPending: number
  _transforms: any[]
  _entryOrder: number
  _ticked: boolean
  _bresolve: (id: any, opts: any, cb: any) => void
  _syntaxCache: {}
  _filterTransform: (tr: any) => boolean
  pipeline: any
  _bpack: any
  _extensions: any
  _bundled: any
  _recorded: any[]
  _mdeps: ModuleDeps

  constructor(
    files: any,
    opts: {
      entries?: any
      node?: any
      bare?: any
      browserField?: any
      builtins?: any
      commondir?: any
      insertGlobalVars?: any
      noparse?: any
      noParse?: any
      basedir?: any
      dedupe?: any
      ignoreTransform?: any
      transform?: any
      require?: any
      plugin?: any
    }
  ) {
    super()
    var self = this
    //@ts-ignore
    //if (!(this instanceof Browserify)) return new Browserify(files, opts)
    if (!opts) opts = {}
    if (typeof files === "string" || isArray(files) || isStream(files)) {
      opts = xtend(opts, { entries: [].concat(opts.entries || [], files) })
    } else opts = xtend(files, opts)
    if (opts.node) {
      opts.bare = true
      opts.browserField = false
    }
    if (opts.bare) {
      opts.builtins = false
      opts.commondir = false
    }
    self._options = opts
    if (opts.noparse) opts.noParse = opts.noparse
    if (opts.basedir !== undefined && typeof opts.basedir !== "string") {
      throw new Error("opts.basedir must be either undefined or a string.")
    }
    opts.dedupe = opts.dedupe === false ? false : true
    self._external = []
    self._exclude = []
    self._ignore = []
    self._expose = {}
    self._hashes = {}
    self._pending = 0
    self._transformOrder = 0
    self._transformPending = 0
    self._transforms = []
    self._entryOrder = 0
    self._ticked = false
    var browserField = opts.browserField
    self._bresolve =
      browserField === false
        ? function (id, opts, cb) {
            if (!opts.basedir) {
              opts.basedir = path.dirname(opts.filename)
            }
            resolve(id, opts, cb)
          }
        : typeof browserField === "string"
        ? function (id, opts, cb) {
            opts.browser = browserField
            bresolve(id, opts, cb)
          }
        : bresolve
    self._syntaxCache = {}
    var ignoreTransform = [].concat(opts.ignoreTransform).filter(Boolean)
    self._filterTransform = function (tr) {
      if (isArray(tr)) {
        return ignoreTransform.indexOf(tr[0]) === -1
      }
      return ignoreTransform.indexOf(tr) === -1
    }
    self.pipeline = self._createPipeline(opts)
    ;[]
      .concat(opts.transform)
      .filter(Boolean)
      .filter(self._filterTransform)
      .forEach(function (tr) {
        self.transform(tr)
      })
    ;[]
      .concat(opts.entries)
      .filter(Boolean)
      .forEach(function (file) {
        self.add(file, { basedir: opts.basedir })
      })
    ;[]
      .concat(opts.require)
      .filter(Boolean)
      .forEach(function (file) {
        self.require(file, { basedir: opts.basedir })
      })
    ;[]
      .concat(opts.plugin)
      .filter(Boolean)
      .forEach(function (p) {
        self.plugin(p, { basedir: opts.basedir })
      })
  }

  require(file, opts) {
    var self = this
    if (isArray(file)) {
      file.forEach(function (x) {
        if (typeof x === "object") {
          self.require(x.file, xtend(opts, x))
        } else self.require(x, opts)
      })
      return this
    }
    if (!opts) opts = {}
    var basedir = defined(opts.basedir, self._options.basedir, process.cwd())
    var expose = opts.expose
    if (file === expose && /^[\.]/.test(expose)) {
      expose = "/" + relativePath(basedir, expose)
    }
    if (expose === undefined && this._options.exposeAll) {
      expose = true
    }
    if (expose === true) {
      expose = "/" + relativePath(basedir, file)
    }
    if (isStream(file)) {
      self._pending++
      var order = self._entryOrder++
      file.pipe(
        new ConcatStream(function (buf) {
          var filename = opts.file || file.file || path.join(basedir, "_stream_" + order + ".js")
          var id = file.id || expose || filename
          if (expose || opts.entry === false) {
            self._expose[id] = filename
          }
          if (!opts.entry && self._options.exports === undefined) {
            self._bpack.hasExports = true
          }
          var rec = {
            source: buf.toString("utf8"),
            entry: defined(opts.entry, false),
            file: filename,
            id: id,
            order: undefined,
            transform: undefined
          }
          if (rec.entry) rec.order = order
          if (rec.transform === false) rec.transform = false
          self.pipeline.write(rec)
          if (--self._pending === 0) self.emit("_ready")
        })
      )
      return this
    }
    var row
    if (typeof file === "object") {
      row = xtend(file, opts)
    } else if (!opts.entry && isExternalModule(file)) {
      row = xtend(opts, { id: expose || file, file: file })
    } else {
      row = xtend(opts, { file: path.resolve(basedir, file) })
    }
    if (!row.id) {
      row.id = expose || row.file
    }
    if (expose || !row.entry) {
      row.expose = row.id
    }
    if (opts.external) return self.external(file, opts)
    if (row.entry === undefined) row.entry = false
    if (!row.entry && self._options.exports === undefined) {
      self._bpack.hasExports = true
    }
    if (row.entry) row.order = self._entryOrder++
    if (opts.transform === false) row.transform = false
    self.pipeline.write(row)
    return self
  }

  add(file, opts) {
    var self = this
    if (!opts) opts = {}
    if (isArray(file)) {
      file.forEach(function (x) {
        self.add(x, opts)
      })
      return this
    }
    return this.require(file, xtend({ entry: true, expose: false }, opts))
  }

  external(file, opts) {
    var self = this
    if (isArray(file)) {
      file.forEach(function (f) {
        if (typeof f === "object") {
          self.external(f, xtend(opts, f))
        } else self.external(f, opts)
      })
      return this
    }
    if (file && typeof file === "object" && typeof file.bundle === "function") {
      var b = file
      self._pending++
      var bdeps = {}
      var blabels = {}
      b.on("label", function (prev, id) {
        self._external.push(id)
        if (prev !== id) {
          blabels[prev] = id
          self._external.push(prev)
        }
      })
      b.pipeline.get("deps").push(
        through.obj(function (row, enc, next) {
          bdeps = xtend(bdeps, row.deps)
          this.push(row)
          next()
        })
      )
      self.on("dep", function (row) {
        Object.keys(row.deps).forEach(function (key) {
          var prev = bdeps[key]
          if (prev) {
            var id = blabels[prev]
            if (id) {
              row.indexDeps[key] = id
            }
          }
        })
      })
      b.pipeline.get("label").once("end", function () {
        if (--self._pending === 0) self.emit("_ready")
      })
      return this
    }
    if (!opts) opts = {}
    var basedir = defined(opts.basedir, process.cwd())
    this._external.push(file)
    this._external.push("/" + relativePath(basedir, file))
    return this
  }

  exclude(file, opts) {
    if (!opts) opts = {}
    if (isArray(file)) {
      var self = this
      file.forEach(function (file) {
        self.exclude(file, opts)
      })
      return this
    }
    var basedir = defined(opts.basedir, process.cwd())
    this._exclude.push(file)
    this._exclude.push("/" + relativePath(basedir, file))
    return this
  }

  ignore(file, opts) {
    if (!opts) opts = {}
    if (isArray(file)) {
      var self = this
      file.forEach(function (file) {
        self.ignore(file, opts)
      })
      return this
    }
    var basedir = defined(opts.basedir, process.cwd())
    if (file[0] === ".") {
      this._ignore.push(path.resolve(basedir, file))
    } else {
      this._ignore.push(file)
    }
    return this
  }

  transform(tr, opts?) {
    var self = this
    if (typeof opts === "function" || typeof opts === "string") {
      tr = [opts, tr]
    }
    if (isArray(tr)) {
      opts = tr[1]
      tr = tr[0]
    }
    if (typeof tr === "string" && !self._filterTransform(tr)) {
      return this
    }
    function resolved() {
      self._transforms[order] = rec
      --self._pending
      if (--self._transformPending === 0) {
        self._transforms.forEach(function (transform) {
          self.pipeline.write(transform)
        })
        if (self._pending === 0) {
          self.emit("_ready")
        }
      }
    }
    if (!opts) opts = {}
    opts._flags = "_flags" in opts ? opts._flags : self._options
    var basedir = defined(opts.basedir, this._options.basedir, process.cwd())
    var order = self._transformOrder++
    self._pending++
    self._transformPending++
    var rec = {
      transform: tr,
      options: opts,
      global: opts.global
    }
    if (typeof tr === "string") {
      var topts = {
        basedir: basedir,
        paths: (self._options.paths || []).map(function (p) {
          return path.resolve(basedir, p)
        })
      }
      resolve(tr, topts, function (err, res) {
        if (err) return self.emit("error", err)
        rec.transform = res
        resolved()
      })
    } else process.nextTick(resolved)
    return this
  }

  plugin(p, opts) {
    if (isArray(p)) {
      opts = p[1]
      p = p[0]
    }
    if (!opts) opts = {}
    var basedir = defined(opts.basedir, this._options.basedir, process.cwd())
    if (typeof p === "function") {
      p(this, opts)
    } else {
      var pfile = resolve.sync(String(p), { basedir: basedir })
      var f = require(pfile)
      if (typeof f !== "function") {
        throw new Error("plugin " + p + " should export a function")
      }
      f(this, opts)
    }
    return this
  }

  _createPipeline(opts) {
    var self = this
    if (!opts) opts = {}
    this._mdeps = this._createDeps(opts)
    this._mdeps.on("file", function (file, id) {
      pipeline.emit("file", file, id)
      self.emit("file", file, id)
    })
    this._mdeps.on("package", function (pkg) {
      pipeline.emit("package", pkg)
      self.emit("package", pkg)
    })
    this._mdeps.on("transform", function (tr, file) {
      pipeline.emit("transform", tr, file)
      self.emit("transform", tr, file)
    })
    var dopts = {
      index: !opts.fullPaths && !opts.exposeAll,
      dedupe: opts.dedupe,
      expose: this._expose
    }

    this._bpack = browserPack(xtend(opts, { raw: true }))

    // prettier-ignore
    var pipeline = new LabeledStreamSplicer([
        'record', [this._recorder()],
        'deps', [this._mdeps],
        'json', [this._json()],
        'unbom', [this._unbom()],
        'unshebang', [this._unshebang()],
        'syntax', [this._syntax()],
        'sort', [depsSort(dopts)],
        'dedupe', [this._dedupe()],
        'label', [this._label(opts)],
        'emit-deps', [this._emitDeps()],
        'debug', [this._debug(opts)],
        'pack', [this._bpack],
        'wrap', []
    ]);
    if (opts.exposeAll) {
      var basedir = defined(opts.basedir, process.cwd())
      pipeline.get("deps").push(
        through.obj(function (row, enc, next) {
          if (self._external.indexOf(row.id) >= 0) return next()
          if (self._external.indexOf(row.file) >= 0) return next()
          if (isAbsolutePath(row.id)) {
            row.id = "/" + relativePath(basedir, row.file)
          }
          Object.keys(row.deps || {}).forEach(function (key) {
            row.deps[key] = "/" + relativePath(basedir, row.deps[key])
          })
          this.push(row)
          next()
        })
      )
    }
    return pipeline
  }

  //_createDeps(opts: { basedir: any; transformKey: any; postFilter: (arg0: any, arg1: any, arg2: any) => any; filter: (arg0: any) => any; bundleExternal: boolean; preserveSymlinks: any; node: any; bare: any; target: string; debug: any; insertGlobals: any; commondir: boolean; builtins: any }) {

  _createDeps(opts: ModuleDepsOptions) {
    var self = this
    var mopts: ModuleDepsOptions = xtend(opts)
    var basedir = defined(opts.basedir, process.cwd())
    mopts.expose = this._expose
    mopts.extensions = [".js", ".json"].concat(mopts.extensions || [])
    self._extensions = mopts.extensions
    mopts.transform = []
    mopts.transformKey = defined(opts.transformKey, ["browserify", "transform"])
    mopts.postFilter = function (id, file, pkg) {
      if (opts.postFilter && !opts.postFilter(id, file, pkg)) return false
      if (self._external.indexOf(file) >= 0) return false
      if (self._exclude.indexOf(file) >= 0) return false
      if (pkg && pkg.browserify && pkg.browserify.transform) {
        pkg.browserify.transform = [].concat(pkg.browserify.transform).filter(Boolean).filter(self._filterTransform)
      }
      return true
    }
    mopts.filter = function (id) {
      if (opts.filter && !opts.filter(id)) return false
      if (self._external.indexOf(id) >= 0) return false
      if (self._exclude.indexOf(id) >= 0) return false
      if (opts.bundleExternal === false && isExternalModule(id)) {
        return false
      }
      return true
    }

    mopts.resolve = function (id, parent, cb) {
      if (self._ignore.indexOf(id) >= 0) return cb(null, paths.empty, {})
      self._bresolve(id, parent, function (err, file, pkg) {
        if (file && self._ignore.indexOf(file) >= 0) {
          return cb(null, paths.empty, {})
        }
        if (file && self._ignore.length) {
          var nm = file.replace(/\\/g, "/").split("/node_modules/")[1]
          if (nm) {
            nm = nm.split("/")[0]
            if (self._ignore.indexOf(nm) >= 0) {
              return cb(null, paths.empty, {})
            }
          }
        }
        if (file) {
          var ex = "/" + relativePath(basedir, file)
          if (self._external.indexOf(ex) >= 0) {
            return cb(null, ex)
          }
          if (self._exclude.indexOf(ex) >= 0) {
            return cb(null, ex)
          }
          if (self._ignore.indexOf(ex) >= 0) {
            return cb(null, paths.empty, {})
          }
        }
        if (err) cb(err, file, pkg)
        else if (file) {
          if (opts.preserveSymlinks && parent.id !== self._mdeps.top.id) {
            return cb(err, path.resolve(file), pkg, file)
          }
          fs.realpath(file, function (err, res) {
            cb(err, res, pkg, file)
          })
        } else cb(err, null, pkg)
      })
    }

    builtinModules.forEach((key) => self._exclude.push(key))

    mopts.globalTransform = []

    if (!this._bundled) {
      this.once("bundle", function () {
        self.pipeline.write({
          transform: globalTr,
          global: true,
          options: {}
        })
      })
    }
    function globalTr(file) {
      if (opts.node || opts.bare || opts.target == "node") return through()
      else
        return insertModuleGlobals(
          file,
          xtend(opts, {
            debug: opts.debug,
            always: opts.insertGlobals,
            basedir: opts.commondir === false && isArray(opts.builtins) ? "/" : opts.basedir || process.cwd()
          })
        )
    }
    return new ModuleDeps(mopts)
  }

  _recorder() {
    var self = this
    var ended = false
    this._recorded = []

    if (!this._ticked) {
      process.nextTick(() => {
        this._ticked = true
        this._recorded.forEach((row) => {
          stream.push(row)
        })
        if (ended) stream.push(null)
      })
    }

    var stream = through.obj(
      function write(row, enc, next) {
        self._recorded.push(row)
        if (self._ticked) this.push(row)
        next()
      },
      function end() {
        ended = true
        if (self._ticked) this.push(null)
      }
    )

    return stream
  }

  _json() {
    return through.obj(function (row, enc, next) {
      if (/\.json$/.test(row.file)) {
        row.source = "module.exports=" + sanitize(row.source)
      }
      this.push(row)
      next()
    })
  }

  _unbom() {
    return through.obj(function (row, enc, next) {
      if (/^\ufeff/.test(row.source)) {
        row.source = row.source.replace(/^\ufeff/, "")
      }
      this.push(row)
      next()
    })
  }

  _unshebang() {
    return through.obj(function (row, enc, next) {
      if (/^#!/.test(row.source)) {
        row.source = row.source.replace(/^#![^\n]*\n/, "")
      }
      this.push(row)
      next()
    })
  }

  _syntax() {
    var self = this
    return through.obj(function (row, enc, next) {
      var h = shasum(row.source)
      if (typeof self._syntaxCache[h] === "undefined") {
        var err = checkSyntax(row.source, row.file || row.id)
        if (err) return this.emit("error", err)
        self._syntaxCache[h] = true
      }
      this.push(row)
      next()
    })
  }

  _dedupe() {
    return through.obj(function (row, enc, next) {
      if (!row.dedupeIndex && row.dedupe) {
        row.source = "arguments[4][" + JSON.stringify(row.dedupe) + "][0].apply(exports,arguments)"
        row.nomap = true
      } else if (row.dedupeIndex) {
        row.source = "arguments[4][" + JSON.stringify(row.dedupeIndex) + "][0].apply(exports,arguments)"
        row.nomap = true
      }
      if (row.dedupeIndex && row.indexDeps) {
        row.indexDeps.dup = row.dedupeIndex
      }
      this.push(row)
      next()
    })
  }

  _label(opts) {
    var self = this
    var basedir = defined(opts.basedir, process.cwd())
    return through.obj(function (row, enc, next) {
      var prev = row.id
      if (self._external.indexOf(row.id) >= 0) return next()
      if (self._external.indexOf("/" + relativePath(basedir, row.id)) >= 0) {
        return next()
      }
      if (self._external.indexOf(row.file) >= 0) return next()
      if (row.index) row.id = row.index
      self.emit("label", prev, row.id)
      if (row.indexDeps) row.deps = row.indexDeps || {}
      Object.keys(row.deps).forEach(function (key) {
        if (self._expose[key]) {
          row.deps[key] = key
          return
        }
        var afile = path.resolve(path.dirname(row.file), key)
        var rfile = "/" + relativePath(basedir, afile)
        if (self._external.indexOf(rfile) >= 0) {
          row.deps[key] = rfile
        }
        if (self._external.indexOf(afile) >= 0) {
          row.deps[key] = rfile
        }
        if (self._external.indexOf(key) >= 0) {
          row.deps[key] = key
          return
        }
        for (var i = 0; i < self._extensions.length; i++) {
          var ex = self._extensions[i]
          if (self._external.indexOf(rfile + ex) >= 0) {
            row.deps[key] = rfile + ex
            break
          }
        }
      })
      if (row.entry || row.expose) {
        self._bpack.standaloneModule = row.id
      }
      this.push(row)
      next()
    })
  }

  _emitDeps() {
    var self = this
    return through.obj(function (row, enc, next) {
      self.emit("dep", row)
      this.push(row)
      next()
    })
  }

  _debug(opts) {
    var basedir = defined(opts.basedir, process.cwd())
    return through.obj(function (row, enc, next) {
      if (opts.debug) {
        row.sourceRoot = "file://localhost"
        row.sourceFile = relativePath(basedir, row.file)
      }
      this.push(row)
      next()
    })
  }

  reset(opts?) {
    if (!opts) opts = {}
    var hadExports = this._bpack.hasExports
    this.pipeline = this._createPipeline(xtend(opts, this._options))
    this._bpack.hasExports = hadExports
    this._entryOrder = 0
    this._bundled = false
    this.emit("reset")
  }

  bundle(cb) {
    var self = this
    if (cb && typeof cb === "object") {
      throw new Error(
        "bundle() no longer accepts option arguments.\n" + "Move all option arguments to the browserify() constructor."
      )
    }
    if (this._bundled) {
      var recorded = this._recorded
      this.reset()
      recorded.forEach(function (x) {
        self.pipeline.write(x)
      })
    }
    var output = ReadOnlyStream(this.pipeline)
    if (cb) {
      output.on("error", cb)
      output.pipe(
        new ConcatStream(function (body) {
          cb(null, body)
        })
      )
    }
    function ready() {
      self.emit("bundle", output)
      self.pipeline.end()
    }
    if (this._pending === 0) ready()
    else this.once("_ready", ready)
    this._bundled = true
    return output
  }
}

function isStream(s) {
  return s && typeof s.pipe === "function"
}
function isAbsolutePath(file) {
  var regexp = process.platform === "win32" ? /^\w:/ : /^\//
  return regexp.test(file)
}
function isExternalModule(file) {
  var regexp = process.platform === "win32" ? /^(\.|\w:)/ : /^[\/.]/
  return !regexp.test(file)
}

function browserify(
  file: any,
  opts: {
    entries?: any
    node?: any
    bare?: any
    browserField?: any
    builtins?: any
    commondir?: any
    insertGlobalVars?: any
    noparse?: any
    noParse?: any
    basedir?: any
    dedupe?: any
    ignoreTransform?: any
    transform?: any
    require?: any
    plugin?: any
  }
) {
  return new Browserify(file, opts)
}

export { browserify }
