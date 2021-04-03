

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
    }
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
  