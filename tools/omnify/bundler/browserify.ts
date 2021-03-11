//https://github.com/browserify/browserify

import { EventEmitter } from "events"
import fs from "fs"
import { builtinModules } from "module"
import path from "path"
import { Transform  } from "stream"
import { ConcatStream, DuplexWrapper, LabeledStreamSplicer, ReadOnlyStream, StreamCombiner, through } from "../streams"
import { browserPack } from "./browser-pack"
import { depsSort } from "./deps-sort"
//import bresolve from "browser-resolve"
//import resolve from "resolve"
import { bresolve, resolve } from "./resolve"
import { shasum } from "./shasum"

//import {LabeledStreamSplicer} from './labeled-stream-splicer'



var paths = {
  empty: null,
}

var isArray = Array.isArray
//const { nextTick } = process

var nextTick = typeof setImmediate !== "undefined" ? setImmediate : process.nextTick

function defined(...args) {
  for (var i = 0; i < args.length; i++) {
    if (args[i] !== undefined) return args[i]
  }
}

function has(obj, key) {
  return obj && Reflect.has(obj, key)
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
  "\u2029": "\\u2029",
}

const sanitize = (str) => str.replace(/[\u2028\u2029]/g, (v) => TERMINATORS_LOOKUP[v])

function removeComments(string) {
  return string.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "").trim()
}

const findImports = (code_string) => {
  let _code_string = removeComments(code_string)
  return [
    ...new Set(
      [
        [..._code_string.matchAll(/require\((["'])(.*?)\1\)/g)].map((v) => v[2]),
        [..._code_string.matchAll(/import\((["'])(.*?)\1\)/g)].map((v) => v[2]),
        [..._code_string.matchAll(/(}| })from (["'])(.*?)\1/g)].map((v) => v[2]),
      ].flat()
    ),
  ]
}

const detective = (code_string) => {
  return {
    strings: findImports(code_string),
  }
}

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

var defaultVars = {
  process: function () {
    return `(function () {
    //include global shims here too
    self.setImmediate = setTimeout;
    self.cancelImmediate = clearTimeout;

    if(!process) var process = {};
    process.nextTick = function (cb) { queueMicrotask((cb)); };
    process.title = 'browser';
    process.browser = true;
    process.env = {};
    process.argv = [];
    process.version = ''; // empty string to avoid regexp issues
    process.versions = {};
    function noop() {}
    process.on = noop;
    process.addListener = noop;
    process.once = noop;
    process.off = noop;
    process.removeListener = noop;
    process.removeAllListeners = noop;
    process.emit = noop;
    process.prependListener = noop;
    process.prependOnceListener = noop;
    process.listeners = function (name) { return [] }
    process.binding = function (name) {
        throw new Error('process.binding is not supported');
    };
    process.cwd = function () { return '/' };
    process.chdir = function (dir) {
        throw new Error('process.chdir is not supported');
    };
    process.umask = function() { return 0; };
    return process
    })()`
  },
  global: function () {
    return (
      'typeof global !== "undefined" ? global : ' +
      'typeof self !== "undefined" ? self : ' +
      'typeof window !== "undefined" ? window : {}'
    )
  },
  __filename: function (file, basedir) {
    var relpath = path.relative(basedir, file)
    if (path.sep === "\\") {
      relpath = relpath.replace(/\\/g, "/")
    }
    var filename = "/" + relpath
    return JSON.stringify(filename)
  },
  __dirname: function (file, basedir) {
    var relpath = path.relative(basedir, file)
    if (path.sep === "\\") {
      relpath = relpath.replace(/\\/g, "/")
    }
    var dir = path.dirname("/" + relpath)
    return JSON.stringify(dir)
  },
}

function insertModuleGlobals(file, opts) {
  if (/\.json$/i.test(file)) return through()
  if (!opts) opts = {}

  var basedir = opts.basedir || "/"
  var vars = Object.assign({}, defaultVars, opts.vars)
  var varNames = Object.keys(vars).filter(function (name) {
    return typeof vars[name] === "function"
  })

  var quick = RegExp(
    varNames
      .map(function (name) {
        return "\\b" + name + "\\b"
      })
      .join("|")
  )

  var chunks = []

  return through(write, end)

  function write(chunk, enc, next) {
    chunks.push(chunk)
    next()
  }

  function end() {
    var self = this
    var source = Buffer.isBuffer(chunks[0]) ? Buffer.concat(chunks).toString("utf8") : chunks.join("")
    source = source.replace(/^\ufeff/, "").replace(/^#![^\n]*\n/, "\n")

    if (opts.always !== true && !quick.test(source)) {
      this.push(source)
      this.push(null)
      return
    }

    // try {
    //     var undeclared = opts.always
    //         ? { identifiers: varNames, properties: [] }
    //         : undeclaredIdentifiers(parse(source), { wildcard: true })
    //     ;
    // }

    try {
      var undeclared = { identifiers: varNames, properties: [] }
    } catch (err) {
      var e = new SyntaxError((err.message || err) + " while parsing " + file) as SyntaxError & {
        type: string
        filename: string
      }
      e.type = "syntax"
      e.filename = file
      return this.emit("error", e)
    }

    var globals = {}

    varNames.forEach(function (name) {
      if (!/\./.test(name)) return
      var parts = name.split(".")
      var prop = undeclared.properties.indexOf(name)
      if (prop === -1 || countprops(undeclared.properties, parts[0]) > 1) return
      var value = vars[name](file, basedir)
      if (!value) return
      globals[parts[0]] = "{" + JSON.stringify(parts[1]) + ":" + value + "}"
      self.emit("global", name)
    })

    varNames.forEach(function (name) {
      if (/\./.test(name)) return
      if (globals[name]) return
      if (undeclared.identifiers.indexOf(name) < 0) return
      var value = vars[name](file, basedir)
      if (!value) return
      globals[name] = value
      self.emit("global", name)
    })

    this.push(closeOver(globals, source, file, opts))
    this.push(null)
  }
}

function closeOver(globals, src, file, opts) {
  var keys = Object.keys(globals)
  if (keys.length === 0) return src
  var values = keys.map(function (key) {
    return globals[key]
  })

  // we double-wrap the source in IIFEs to prevent code like
  //     (function(Buffer){ const Buffer = null }())
  // which causes a parse error.
  var wrappedSource = "(function (){\n" + src + "\n}).call(this)"
  if (keys.length <= 3) {
    wrappedSource = "(function (" + keys.join(",") + "){" + wrappedSource + "}).call(this," + values.join(",") + ")"
  } else {
    // necessary to make arguments[3..6] still work for workerify etc
    // a,b,c,arguments[3..6],d,e,f...
    var extra = ["__argument0", "__argument1", "__argument2", "__argument3"]
    var names = keys.slice(0, 3).concat(extra).concat(keys.slice(3))
    values.splice(3, 0, "arguments[3]", "arguments[4]", "arguments[5]", "arguments[6]")
    wrappedSource = "(function (" + names.join(",") + "){" + wrappedSource + "}).call(this," + values.join(",") + ")"
  }

  // Generate source maps if wanted. Including the right offset for
  // the wrapped source.

  return wrappedSource
}

function countprops(props, name) {
  return props.filter(function (prop) {
    return prop.slice(0, name.length + 1) === name + "."
  }).length
}

//delete opts possibly
function parents(cwd, opts?) {
  if (cwd === undefined) cwd = process.cwd()
  if (!opts) opts = {}
  var platform = opts.platform || process.platform
  var isWindows = /^win/.test(platform)
  var init = isWindows ? "" : "/"
  var res = path
    .normalize(cwd)
    .split("/")
    .reduce(
      function (acc, dir, ix) {
        return acc.concat(path.join(acc[ix], dir))
      },
      [init]
    )
    .slice(1)
    .reverse()
  if (res[0] === res[1]) return [res[0]]
  return res
}

//type ResolverLike = typeof resolve | typeof bresolve

type ModuleDepsOptions = {
  extensions?: Array<string>
  expose?: any
  basedir?: any
  transformKey?: any
  postFilter?: (arg0: any, arg1: any, arg2: any) => any
  filter?: (arg0: any) => any
  bundleExternal?: boolean
  preserveSymlinks?: any
  node?: any
  bare?: any
  target?: string
  debug?: any
  insertGlobals?: any
  commondir?: boolean
  builtins?: any
  persistentCache?: ModuleDeps["persistentCache"]
  cache?: ModuleDeps["cache"]
  fileCache?: ModuleDeps["fileCache"]
  packageCache?: ModuleDeps["pkgCache"]
  paths?: ModuleDeps["paths"]
  transform?: ModuleDeps["transforms"]
  globalTransform?: ModuleDeps["globalTransforms"]
  resolve?: ModuleDeps["resolver"] //resolve or bresolve
  detect?: typeof detective //ModuleDeps["detective"] //detective
}
//& Partial<TransformOptions>;

class ModuleDeps extends Transform {
  basedir: any
  persistentCache: any
  cache: any
  fileCache: any
  pkgCache: any
  pkgFileCache: {}
  pkgFileCachePending: {}
  _emittedPkg: {}
  _transformDeps: {}
  visited: {}
  walking: {}
  entries: any[]
  _input: any[]
  paths: any
  transforms: any[]
  globalTransforms: any[]
  resolver: any
  detective: any
  options: any
  pending: number
  inputPending: number
  top: { id: string; filename: string; paths: any; basedir: any }
  _ended: boolean

  constructor(opts) {
    super({ objectMode: true, ...opts })
    var self = this

    if (!opts) opts = {}
    this.basedir = opts.basedir || process.cwd()
    this.persistentCache =
      opts.persistentCache ||
      function (file, id, pkg, fallback, cb) {
        process.nextTick(function () {
          fallback(null, cb)
        })
      }
    this.cache = opts.cache
    this.fileCache = opts.fileCache
    this.pkgCache = opts.packageCache || {}
    this.pkgFileCache = {}
    this.pkgFileCachePending = {}
    this._emittedPkg = {}
    this._transformDeps = {}
    this.visited = {}
    this.walking = {}
    this.entries = []
    this._input = []
    this.paths = opts.paths || process.env.NODE_PATH || ""
    if (typeof this.paths === "string") {
      var delimiter = path.delimiter || (process.platform === "win32" ? ";" : ":")
      this.paths = this.paths.split(delimiter)
    }
    this.paths = this.paths.filter(Boolean).map(function (p) {
      return path.resolve(self.basedir, p)
    })
    this.transforms = [].concat(opts.transform).filter(Boolean)
    this.globalTransforms = [].concat(opts.globalTransform).filter(Boolean)
    this.resolver = opts.resolve || bresolve
    this.detective = opts.detect || detective
    this.options = Object.assign({}, opts)
    if (!this.options.modules) this.options.modules = {}
    if (!this.options.expose) this.options.expose = {}
    this.pending = 0
    this.inputPending = 0
    var topfile = path.join(this.basedir, "__fake.js")
    this.top = {
      id: topfile,
      filename: topfile,
      paths: this.paths,
      basedir: this.basedir,
    }
  }

  _isTopLevel(file) {
    var isTopLevel = this.entries.some(function (main) {
      var m = relativePath(path.dirname(main), file)
      return m.split(/[\\\/]/).indexOf("node_modules") < 0
    })
    if (!isTopLevel) {
      var m = relativePath(this.basedir, file)
      isTopLevel = m.split(/[\\\/]/).indexOf("node_modules") < 0
    }
    return isTopLevel
  }

  _transform(row, enc, next) {
    var self = this
    if (typeof row === "string") {
      row = { file: row }
    }
    if (row.transform && row.global) {
      this.globalTransforms.push([row.transform, row.options])
      return next()
    } else if (row.transform) {
      this.transforms.push([row.transform, row.options])
      return next()
    }
    self.pending++
    var basedir = defined(row.basedir, self.basedir)
    if (row.entry !== false) {
      self.entries.push(path.resolve(basedir, row.file || row.id))
    }
    self.lookupPackage(row.file, function (err, pkg) {
      if (err && self.options.ignoreMissing) {
        self.emit("missing", row.file, self.top)
        self.pending--
        return next()
      }
      if (err) return self.emit("error", err)
      self.pending--
      self._input.push({ row: row, pkg: pkg })
      next()
    })
  }

  _flush() {
    var self = this
    var files = {}
    self._input.forEach(function (r) {
      var w = r.row,
        f = files[w.file || w.id]
      if (f) {
        f.row.entry = f.row.entry || w.entry
        var ex = f.row.expose || w.expose
        f.row.expose = ex
        if (ex && f.row.file === f.row.id && w.file !== w.id) {
          f.row.id = w.id
        }
      } else files[w.file || w.id] = r
    })
    Object.keys(files).forEach(function (key) {
      var r = files[key]
      var pkg = r.pkg || {}
      var dir = r.row.file ? path.dirname(r.row.file) : self.basedir
      if (!pkg.__dirname) pkg.__dirname = dir
      self.walk(
        r.row,
        Object.assign({}, self.top, {
          filename: path.join(dir, "_fake.js"),
        })
      )
    })
    if (this.pending === 0) this.push(null)
    this._ended = true
  }

  resolve(id, parent, cb) {
    var self = this
    var opts = self.options
    if (xhas(self.cache, parent.id, "deps", id) && self.cache[parent.id].deps[id]) {
      var file = self.cache[parent.id].deps[id]
      var pkg = self.pkgCache[file]
      if (pkg) return cb(null, file, pkg)
      return self.lookupPackage(file, function (err, pkg) {
        cb(null, file, pkg)
      })
    }
    parent.packageFilter = function (p, x) {
      var pkgdir = path.dirname(x)
      if (opts.packageFilter) p = opts.packageFilter(p, x)
      p.__dirname = pkgdir
      return p
    }
    if (opts.extensions) parent.extensions = opts.extensions
    if (opts.modules) parent.modules = opts.modules
    self.resolver(id, parent, function onresolve(err, file, pkg, fakePath) {
      if (err) return cb(err)
      if (!file) return cb(new Error('module not found: "' + id + '" from file ' + parent.filename))
      if (!pkg || !pkg.__dirname) {
        self.lookupPackage(file, function (err, p) {
          if (err) return cb(err)
          if (!p) p = {}
          if (!p.__dirname) p.__dirname = path.dirname(file)
          self.pkgCache[file] = p
          onresolve(err, file, opts.packageFilter ? opts.packageFilter(p, p.__dirname) : p, fakePath)
        })
      } else cb(err, file, pkg, fakePath)
    })
  }

  readFile(file, id, pkg) {
    var self = this
    if (xhas(this.fileCache, file)) {
      return toStream(this.fileCache[file])
    }
    var rs = fs.createReadStream(file, {
      encoding: "utf8",
    })
    return rs
  }

  getTransforms(file: string, pkg: { __dirname: string }, opts?: { builtin?: any; inNodeModules?: any }) {
    if (!opts) opts = {}
    var self = this
    var isTopLevel
    if (opts.builtin || opts.inNodeModules) isTopLevel = false
    else isTopLevel = this._isTopLevel(file)
    var transforms = [].concat(isTopLevel ? this.transforms : []).concat(
      getTransforms(pkg, {
        globalTransform: this.globalTransforms,
        transformKey: this.options.transformKey,
      })
    )
    if (transforms.length === 0) return through()
    var pending = transforms.length
    var streams = []
    var input = through()
    var output = through()

    var dup = new DuplexWrapper(input, output)

    for (var i = 0; i < transforms.length; i++)
      (function (i) {
        makeTransform(transforms[i], function (err, trs) {
          if (err) {
            return dup.emit("error", err)
          }
          streams[i] = trs
          if (--pending === 0) done()
        })
      })(i)
    return dup
    function done() {
      var middle = StreamCombiner.apply(null, streams)
      middle.on("error", function (err) {
        err.message += " while parsing file: " + file
        if (!err.filename) err.filename = file
        dup.emit("error", err)
      })
      input.pipe(middle).pipe(output)
    }
    function makeTransform(tr, cb) {
      var trOpts = {
        _flags: undefined,
      }
      if (Array.isArray(tr)) {
        trOpts = tr[1] || {}
        tr = tr[0]
      }
      trOpts._flags = trOpts.hasOwnProperty("_flags") ? trOpts._flags : self.options
      if (typeof tr === "function") {
        var t = tr(file, trOpts)
        t.on("dep", function (dep) {
          if (!self._transformDeps[file]) self._transformDeps[file] = []
          self._transformDeps[file].push(dep)
        })
        self.emit("transform", t, file)
        nextTick(cb, null, wrapTransform(t))
      } else {
        loadTransform(tr, trOpts, function (err, trs) {
          if (err) return cb(err)
          cb(null, wrapTransform(trs))
        })
      }
    }
    function loadTransform(id, trOpts, cb) {
      var params = {
        basedir: path.dirname(file),
        preserveSymlinks: false,
      }
      resolve(id, params, function nr(err, res, again) {
        if (err && again) return cb && cb(err)
        if (err) {
          params.basedir = pkg.__dirname
          return resolve(id, params, function (e, r) {
            //need to investigate this, possibly mismatch between resolve/browser-resolve
            nr(e, r, true as any)
          })
        }
        if (!res) return cb(new Error("cannot find transform module " + id + " while transforming " + file))
        var r = require(res)
        if (typeof r !== "function") {
          return cb(
            new Error(
              "Unexpected " +
                typeof r +
                " exported by the " +
                JSON.stringify(res) +
                " package. " +
                "Expected a transform function."
            )
          )
        }
        var trs = r(file, trOpts)
        trs.on("dep", function (dep) {
          if (!self._transformDeps[file]) self._transformDeps[file] = []
          self._transformDeps[file].push(dep)
        })
        self.emit("transform", trs, file)
        cb(null, trs)
      })
    }
  }

  //walk(id: any, parent: { id: string; filename: string; paths: any; basedir: any } & { filename: string }, cb: { (err: any, r: any): void; (arg0: any, arg1: any): void }) {

  walk(id, parent, cb?) {
    var self = this
    var opts = self.options
    this.pending++

    //added default undefined
    var rec = {
      entry: undefined,
      file: undefined,
      id: undefined,
      expose: undefined,
      source: undefined,
      noparse: undefined,
      deps: undefined,
    }

    var input
    if (typeof id === "object") {
      rec = Object.assign({}, id)
      if (rec.entry === false) delete rec.entry
      id = rec.file || rec.id
      input = true
      this.inputPending++
    }
    self.resolve(id, parent, function (err, file, pkg, fakePath) {
      var builtin = has(parent.modules, id)
      if (rec.expose) {
        self.options.expose[rec.expose] = self.options.modules[rec.expose] = file
      }
      if (pkg && !self._emittedPkg[pkg.__dirname]) {
        self._emittedPkg[pkg.__dirname] = true
        self.emit("package", pkg)
      }
      if (opts.postFilter && !opts.postFilter(id, file, pkg)) {
        if (--self.pending === 0) self.push(null)
        if (input) --self.inputPending
        return cb && cb(null, undefined)
      }
      if (err && rec.source) {
        file = rec.file
        var ts = self.getTransforms(file, pkg)
        ts.on("error", function (err) {
          self.emit("error", err)
        })
        ts.pipe(
          new ConcatStream(function (body) {
            rec.source = body.toString("utf8")
            fromSource(file, rec.source, pkg)
          })
        )
        return ts.end(rec.source)
      }
      if (err && self.options.ignoreMissing) {
        if (--self.pending === 0) self.push(null)
        if (input) --self.inputPending
        self.emit("missing", id, parent)
        return cb && cb(null, undefined)
      }
      if (err) return self.emit("error", err)
      if (self.visited[file]) {
        if (--self.pending === 0) self.push(null)
        if (input) --self.inputPending
        return cb && cb(null, file)
      }
      self.visited[file] = true
      if (rec.source) {
        var ts = self.getTransforms(file, pkg)
        ts.on("error", function (err) {
          self.emit("error", err)
        })
        ts.pipe(
          new ConcatStream(function (body) {
            rec.source = body.toString("utf8")
            fromSource(file, rec.source, pkg)
          })
        )
        return ts.end(rec.source)
      }
      var c = self.cache && self.cache[file]
      if (c) return fromDeps(file, c.source, c.package, fakePath, Object.keys(c.deps))
      self.persistentCache(file, id, pkg, persistentCacheFallback, function (err, c) {
        self.emit("file", file, id)
        if (err) {
          self.emit("error", err)
          return
        }
        fromDeps(file, c.source, c.package, fakePath, Object.keys(c.deps))
      })
      function persistentCacheFallback(dataAsString, cb) {
        var stream = dataAsString ? toStream(dataAsString) : self.readFile(file, id, pkg).on("error", cb)
        stream
          .pipe(
            self.getTransforms(fakePath || file, pkg, {
              builtin: builtin,
              inNodeModules: parent.inNodeModules,
            })
          )
          .on("error", cb)
          .pipe(
            new ConcatStream(function (body) {
              var src = body.toString("utf8")
              try {
                var deps = getDeps(file, src)
              } catch (err) {
                cb(err)
              }
              if (deps) {
                cb(null, {
                  source: src,
                  package: pkg,
                  deps: deps.reduce(function (deps, dep) {
                    deps[dep] = true
                    return deps
                  }, {}),
                })
              }
            })
          )
      }
    })
    function getDeps(file, src) {
      var deps = rec.noparse ? [] : self.parseDeps(file, src)
      if (self._transformDeps[file]) deps = deps.concat(self._transformDeps[file])
      return deps
    }
    function fromSource(file, src, pkg, fakePath?) {
      var deps = getDeps(file, src)
      if (deps) fromDeps(file, src, pkg, fakePath, deps)
    }
    function fromDeps(file, src, pkg, fakePath, deps) {
      var p = deps.length
      var resolved = {}
      if (input) --self.inputPending
      ;(function resolve() {
        if (self.inputPending > 0) return setTimeout(resolve)
        deps.forEach(function (id) {
          if (opts.filter && !opts.filter(id)) {
            resolved[id] = false
            if (--p === 0) done()
            return
          }
          var isTopLevel = self._isTopLevel(fakePath || file)
          var current = {
            id: file,
            filename: file,
            basedir: path.dirname(file),
            paths: self.paths,
            package: pkg,
            inNodeModules: parent.inNodeModules || !isTopLevel,
          }
          self.walk(id, current, function (err, r) {
            resolved[id] = r
            if (--p === 0) done()
          })
        })
        if (deps.length === 0) done()
      })()
      function done() {
        if (!rec.id) rec.id = file
        if (!rec.source) rec.source = src
        if (!rec.deps) rec.deps = resolved
        if (!rec.file) rec.file = file
        if (self.entries.indexOf(file) >= 0) {
          rec.entry = true
        }
        self.push(rec)
        if (cb) cb(null, file)
        if (--self.pending === 0) self.push(null)
      }
    }
  }

  parseDeps(file, src, cb?) {
    var self = this
    if (this.options.noParse === true) return []
    if (/\.json$/.test(file)) return []
    if (Array.isArray(this.options.noParse) && this.options.noParse.indexOf(file) >= 0) {
      return []
    }
    try {
      var deps = self.detective(src).strings
    } catch (ex) {
      var message = ex && ex.message ? ex.message : ex
      throw new Error("Parsing file " + file + ": " + message)
    }
    return deps
  }

  lookupPackage(file, cb) {
    var self = this
    var cached = this.pkgCache[file]
    if (cached) return nextTick(cb, null, cached)
    if (cached === false) return nextTick(cb, null, undefined)
    var dirs = parents(file ? path.dirname(file) : self.basedir)
    ;(function next() {
      if (dirs.length === 0) {
        self.pkgCache[file] = false
        return cb(null, undefined)
      }
      var dir = dirs.shift()
      if (dir.split(/[\\\/]/).slice(-1)[0] === "node_modules") {
        return cb(null, undefined)
      }
      var pkgfile = path.join(dir, "package.json")
      var cached = self.pkgCache[pkgfile]
      if (cached) return nextTick(cb, null, cached)
      else if (cached === false) return next()
      var pcached = self.pkgFileCachePending[pkgfile]
      if (pcached) return pcached.push(onpkg)
      pcached = self.pkgFileCachePending[pkgfile] = []

      fs.readFile(pkgfile, function (err, src) {
        if (err) return onpkg()
        try {
          //typescript has wrong types as of tsc v-4.1.5 - this works 100%
          // fs.readFile("./package.json", function (err, src) {
          //     var pkg = JSON.parse(src);
          //     console.log("success",  pkg)
          // });

          var pkg = JSON.parse(src as any)
        } catch (err) {
          return onpkg(new Error([err + " while parsing json file " + pkgfile].join("")))
        }
        pkg.__dirname = dir
        self.pkgCache[pkgfile] = pkg
        self.pkgCache[file] = pkg
        onpkg(null, pkg)
      })

      function onpkg(err?: Error, pkg?: unknown) {
        if (self.pkgFileCachePending[pkgfile]) {
          var fns = self.pkgFileCachePending[pkgfile]
          delete self.pkgFileCachePending[pkgfile]
          fns.forEach(function (f) {
            f(err, pkg)
          })
        }
        if (err) cb(err)
        else if (pkg && typeof pkg === "object") cb(null, pkg)
        else {
          self.pkgCache[pkgfile] = false
          next()
        }
      }
    })()
  }
}

function getTransforms(pkg, opts) {
  var trx = []
  if (opts.transformKey) {
    var n = pkg
    var keys = opts.transformKey
    for (var i = 0; i < keys.length; i++) {
      if (n && typeof n === "object") n = n[keys[i]]
      else break
    }
    if (i === keys.length) {
      trx = [].concat(n).filter(Boolean)
    }
  }
  return trx.concat(opts.globalTransform || [])
}

function xhas(obj, ...args) {
  if (!obj) return false
  for (var i = 1; i < arguments.length; i++) {
    var key = arguments[i]
    if (!has(obj, key)) return false
    obj = obj[key]
  }
  return true
}

function toStream(dataAsString) {
  var tr = through()
  tr.push(dataAsString)
  tr.push(null)
  return tr
}

function wrapTransform(tr) {
  if (typeof tr.read === "function") return tr
  var input = through()
  var output = through()
  input.pipe(tr).pipe(output)
  var wrapper = new DuplexWrapper(input, output)
  tr.on("error", function (err) {
    wrapper.emit("error", err)
  })
  return wrapper
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
            transform: undefined,
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
      global: opts.global,
    }
    if (typeof tr === "string") {
      var topts = {
        basedir: basedir,
        paths: (self._options.paths || []).map(function (p) {
          return path.resolve(basedir, p)
        }),
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
      expose: this._expose,
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
          options: {},
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
            basedir: opts.commondir === false && isArray(opts.builtins) ? "/" : opts.basedir || process.cwd(),
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
function relativePath(from, to) {
  return cachedPathRelative(from, to).replace(/\\/g, "/")
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
