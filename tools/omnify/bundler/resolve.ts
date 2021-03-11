import fs from "fs";
import { builtinModules } from "module";
import path from "path";
var core = new Set(builtinModules);




function normalizeOptions(x, opts) {
  /**
   * This file is purposefully a passthrough. It's expected that third-party
   * environments will override it at runtime in order to inject special logic
   * into `resolve` (by manipulating the options). One such example is the PnP
   * code path in Yarn.
   */
  return opts || {};
}

var getNodeModulesDirs = function getNodeModulesDirs(absoluteStart, modules) {
  var prefix = "/";
  if (/^([A-Za-z]:)/.test(absoluteStart)) {
    prefix = "";
  } else if (/^\\\\/.test(absoluteStart)) {
    prefix = "\\\\";
  }

  var paths = [absoluteStart];
  var parsed = path.parse(absoluteStart);
  while (parsed.dir !== paths[paths.length - 1]) {
    paths.push(parsed.dir);
    parsed = path.parse(parsed.dir);
  }

  return paths.reduce(function (dirs, aPath) {
    return dirs.concat(
      modules.map(function (moduleDir) {
        return path.resolve(prefix, aPath, moduleDir);
      })
    );
  }, []);
};

function nodeModulesPaths(start, opts, request) {
  var modules = opts && opts.moduleDirectory ? [].concat(opts.moduleDirectory) : ["node_modules"];

  if (opts && typeof opts.paths === "function") {
    return opts.paths(
      request,
      start,
      function () {
        return getNodeModulesDirs(start, modules);
      },
      opts
    );
  }

  var dirs = getNodeModulesDirs(start, modules);
  return opts && opts.paths ? dirs.concat(opts.paths) : dirs;
}

function caller() {
  // see https://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
  var origPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = function (_, stack) {
    return stack;
  };
  var stack = new Error().stack;
  Error.prepareStackTrace = origPrepareStackTrace;
  //@ts-ignore
  return stack[2].getFileName();
}

var defaultIsFile = function isFile(file, cb) {
  fs.stat(file, function (err, stat) {
    if (!err) {
      return cb(null, stat.isFile() || stat.isFIFO());
    }
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return cb(null, false);
    return cb(err);
  });
};

var defaultIsDir = function isDirectory(dir, cb) {
  fs.stat(dir, function (err, stat) {
    if (!err) {
      return cb(null, stat.isDirectory());
    }
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return cb(null, false);
    return cb(err);
  });
};

function resolve(x, options, callback) {
  var cb = callback;
  var opts = options;
  if (typeof options === "function") {
    cb = opts;
    opts = {};
  }
  if (typeof x !== "string") {
    var err = new TypeError("Path must be a string.");
    return process.nextTick(function () {
      cb(err);
    });
  }

  opts = normalizeOptions(x, opts);

  var isFile = opts.isFile || defaultIsFile;
  var isDirectory = opts.isDirectory || defaultIsDir;
  var readFile = opts.readFile || fs.readFile;

  var extensions = opts.extensions || [".js"];
  var basedir = opts.basedir || path.dirname(caller());
  var parent = opts.filename || basedir;

  opts.paths = opts.paths || [];

  // ensure that `basedir` is an absolute path at this point, resolving against the process' current working directory
  var absoluteStart = path.resolve(basedir);

  if (opts.preserveSymlinks === false) {
    fs.realpath(absoluteStart, function (realPathErr, realStart) {
      if (realPathErr && realPathErr.code !== "ENOENT") cb(err);
      else init(realPathErr ? absoluteStart : realStart);
    });
  } else {
    init(absoluteStart);
  }

  var res;
  function init(basedir) {
    if (/^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/.test(x)) {
      res = path.resolve(basedir, x);
      if (x === ".." || x.slice(-1) === "/") res += "/";
      if (/\/$/.test(x) && res === basedir) {
        loadAsDirectory(res, opts.package, onfile);
      } else loadAsFile(res, opts.package, onfile);
    } else
      loadNodeModules(x, basedir, function (err, n, pkg) {
        if (err) cb(err);
        else if (core.has(x)) return cb(null, x);
        else if (n) cb(null, n, pkg);
        else {
          var moduleError = new Error("Cannot find module '" + x + "' from '" + parent + "'");
          //@ts-ignore
          moduleError.code = "MODULE_NOT_FOUND";
          cb(moduleError);
        }
      });
  }

  function onfile(err, m, pkg) {
    if (err) cb(err);
    else if (m) cb(null, m, pkg);
    else
      loadAsDirectory(res, function (err, d, pkg) {
        if (err) cb(err);
        else if (d) cb(null, d, pkg);
        else {
          var moduleError = new Error("Cannot find module '" + x + "' from '" + parent + "'");
          //@ts-ignore
          moduleError.code = "MODULE_NOT_FOUND";
          cb(moduleError);
        }
      });
  }

  function loadAsFile(x, thePackage, callback) {
    var loadAsFilePackage = thePackage;
    var cb = callback;
    if (typeof loadAsFilePackage === "function") {
      cb = loadAsFilePackage;
      loadAsFilePackage = undefined;
    }

    var exts = [""].concat(extensions);
    load(exts, x, loadAsFilePackage);

    function load(exts, x, loadPackage) {
      if (exts.length === 0) return cb(null, undefined, loadPackage);
      var file = x + exts[0];

      var pkg = loadPackage;
      if (pkg) onpkg(null, pkg);
      else loadpkg(path.dirname(file), onpkg);

      function onpkg(err, pkg_, dir?) {
        pkg = pkg_;
        if (err) return cb(err);
        if (dir && pkg && opts.pathFilter) {
          var rfile = path.relative(dir, file);
          var rel = rfile.slice(0, rfile.length - exts[0].length);
          var r = opts.pathFilter(pkg, x, rel);
          if (r) return load([""].concat(extensions.slice()), path.resolve(dir, r), pkg);
        }
        isFile(file, onex);
      }
      function onex(err, ex) {
        if (err) return cb(err);
        if (ex) return cb(null, file, pkg);
        load(exts.slice(1), x, pkg);
      }
    }
  }

  function loadpkg(dir, cb) {
    if (dir === "" || dir === "/") return cb(null);
    if (process.platform === "win32" && /^\w:[/\\]*$/.test(dir)) {
      return cb(null);
    }
    if (/[/\\]node_modules[/\\]*$/.test(dir)) return cb(null);

    var pkgfile = path.join(dir, "package.json");
    isFile(pkgfile, function (err, ex) {
      // on err, ex is false
      if (!ex) return loadpkg(path.dirname(dir), cb);

      readFile(pkgfile, function (err, body) {
        if (err) cb(err);
        try {
          var pkg = JSON.parse(body);
        } catch (jsonErr) {}

        if (pkg && opts.packageFilter) {
          pkg = opts.packageFilter(pkg, pkgfile);
        }
        cb(null, pkg, dir);
      });
    });
  }

  function loadAsDirectory(x, loadAsDirectoryPackage, callback?) {
    var cb = callback;
    var fpkg = loadAsDirectoryPackage;
    if (typeof fpkg === "function") {
      cb = fpkg;
      fpkg = opts.package;
    }

    var pkgfile = path.join(x, "package.json");
    isFile(pkgfile, function (err, ex) {
      if (err) return cb(err);
      if (!ex) return loadAsFile(path.join(x, "index"), fpkg, cb);

      readFile(pkgfile, function (err, body) {
        if (err) return cb(err);
        try {
          var pkg = JSON.parse(body);
        } catch (jsonErr) {}

        if (opts.packageFilter) {
          pkg = opts.packageFilter(pkg, pkgfile);
        }

        if (pkg.main) {
          if (typeof pkg.main !== "string") {
            var mainError = new TypeError("package “" + pkg.name + "” `main` must be a string");
            //@ts-ignore
            mainError.code = "INVALID_PACKAGE_MAIN";
            return cb(mainError);
          }
          if (pkg.main === "." || pkg.main === "./") {
            pkg.main = "index";
          }
          loadAsFile(path.resolve(x, pkg.main), pkg, function (err, m, pkg) {
            if (err) return cb(err);
            if (m) return cb(null, m, pkg);
            if (!pkg) return loadAsFile(path.join(x, "index"), pkg, cb);

            var dir = path.resolve(x, pkg.main);
            loadAsDirectory(dir, pkg, function (err, n, pkg) {
              if (err) return cb(err);
              if (n) return cb(null, n, pkg);
              loadAsFile(path.join(x, "index"), pkg, cb);
            });
          });
          return;
        }

        loadAsFile(path.join(x, "/index"), pkg, cb);
      });
    });
  }

  function processDirs(cb, dirs) {
    if (dirs.length === 0) return cb(null, undefined);
    var dir = dirs[0];

    isDirectory(dir, isdir);

    function isdir(err, isdir) {
      if (err) return cb(err);
      if (!isdir) return processDirs(cb, dirs.slice(1));
      var file = path.join(dir, x);
      loadAsFile(file, opts.package, onfile);
    }

    function onfile(err, m, pkg) {
      if (err) return cb(err);
      if (m) return cb(null, m, pkg);
      loadAsDirectory(path.join(dir, x), opts.package, ondir);
    }

    function ondir(err, n, pkg) {
      if (err) return cb(err);
      if (n) return cb(null, n, pkg);
      processDirs(cb, dirs.slice(1));
    }
  }
  function loadNodeModules(x, start, cb) {
    processDirs(cb, nodeModulesPaths(start, opts, x));
  }
}

function isFile(file) {
  try {
    var stat = fs.statSync(file);
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return false;
    throw e;
  }
  return stat.isFile() || stat.isFIFO();
}

var defaultIsDirSync = function isDirectory(dir) {
  try {
    var stat = fs.statSync(dir);
  } catch (e) {
    if (e && (e.code === "ENOENT" || e.code === "ENOTDIR")) return false;
    throw e;
  }
  return stat.isDirectory();
};

var maybeUnwrapSymlink = function maybeUnwrapSymlink(x, opts) {
  if (!opts || !opts.preserveSymlinks) {
    try {
      return fs.realpathSync(x);
    } catch (realPathErr) {
      if (realPathErr.code !== "ENOENT") {
        throw realPathErr;
      }
    }
  }
  return x;
};

function sync(x, options) {
  if (typeof x !== "string") {
    throw new TypeError("Path must be a string.");
  }
  var opts = normalizeOptions(x, options);

  var isFile = opts.isFile || defaultIsFile;
  var isDirectory = opts.isDirectory || defaultIsDirSync;
  var readFileSync = opts.readFileSync || fs.readFileSync;

  var extensions = opts.extensions || [".js"];
  var basedir = opts.basedir || path.dirname(caller());
  var parent = opts.filename || basedir;

  opts.paths = opts.paths || [];

  // ensure that `basedir` is an absolute path at this point, resolving against the process' current working directory
  var absoluteStart = maybeUnwrapSymlink(path.resolve(basedir), opts);

  if (opts.basedir && !isDirectory(absoluteStart)) {
    var dirError = new TypeError(
      'Provided basedir "' +
        opts.basedir +
        '" is not a directory' +
        (opts.preserveSymlinks ? "" : ", or a symlink to a directory")
    );
    //@ts-ignore
    dirError.code = "INVALID_BASEDIR";
    throw dirError;
  }

  if (/^(?:\.\.?(?:\/|$)|\/|([A-Za-z]:)?[/\\])/.test(x)) {
    var res = path.resolve(absoluteStart, x);
    if (x === ".." || x.slice(-1) === "/") res += "/";
    var m = loadAsFileSync(res) || loadAsDirectorySync(res);
    if (m) return maybeUnwrapSymlink(m, opts);
  } else if (core[x]) {
    return x;
  } else {
    var n = loadNodeModulesSync(x, absoluteStart);
    if (n) return maybeUnwrapSymlink(n, opts);
  }

  if (core[x]) return x;

  var err = new Error("Cannot find module '" + x + "' from '" + parent + "'");
  //@ts-ignore
  err.code = "MODULE_NOT_FOUND";
  throw err;

  function loadAsFileSync(x) {
    var pkg = loadpkg(path.dirname(x));

    if (pkg && pkg.dir && pkg.pkg && opts.pathFilter) {
      var rfile = path.relative(pkg.dir, x);
      var r = opts.pathFilter(pkg.pkg, x, rfile);
      if (r) {
        x = path.resolve(pkg.dir, r); // eslint-disable-line no-param-reassign
      }
    }

    if (isFile(x)) {
      return x;
    }

    for (var i = 0; i < extensions.length; i++) {
      var file = x + extensions[i];
      if (isFile(file)) {
        return file;
      }
    }
  }

  function loadpkg(dir) {
    if (dir === "" || dir === "/") return;
    if (process.platform === "win32" && /^\w:[/\\]*$/.test(dir)) {
      return;
    }
    if (/[/\\]node_modules[/\\]*$/.test(dir)) return;

    var pkgfile = path.join(dir, "package.json");

    if (!isFile(pkgfile)) {
      return loadpkg(path.dirname(dir));
    }

    var body = readFileSync(pkgfile);

    try {
      var pkg = JSON.parse(body);
    } catch (jsonErr) {}

    if (pkg && opts.packageFilter) {
      pkg = opts.packageFilter(pkg, pkgfile, dir);
    }

    return { pkg: pkg, dir: dir };
  }

  function loadAsDirectorySync(x) {
    var pkgfile = path.join(x, "/package.json");
    if (isFile(pkgfile)) {
      try {
        var body = readFileSync(pkgfile, "UTF8");
        var pkg = JSON.parse(body);
      } catch (e) {}

      if (opts.packageFilter) {
        pkg = opts.packageFilter(pkg, x);
      }

      if (pkg.main) {
        if (typeof pkg.main !== "string") {
          var mainError = new TypeError("package “" + pkg.name + "” `main` must be a string");
          //@ts-ignore
          mainError.code = "INVALID_PACKAGE_MAIN";
          throw mainError;
        }
        if (pkg.main === "." || pkg.main === "./") {
          pkg.main = "index";
        }
        try {
          var m = loadAsFileSync(path.resolve(x, pkg.main));
          if (m) return m;
          var n = loadAsDirectorySync(path.resolve(x, pkg.main));
          if (n) return n;
        } catch (e) {}
      }
    }

    return loadAsFileSync(path.join(x, "/index"));
  }

  function loadNodeModulesSync(x, start) {
    var dirs = nodeModulesPaths(start, opts, x);
    for (var i = 0; i < dirs.length; i++) {
      var dir = dirs[i];
      if (isDirectory(dir)) {
        var m = loadAsFileSync(path.join(dir, "/", x));
        if (m) return m;
        var n = loadAsDirectorySync(path.join(dir, "/", x));
        if (n) return n;
      }
    }
  }
}

resolve.sync = sync;

/* -------------------------------------------------------------------------- */
/*                               browser resolve                              */
/* -------------------------------------------------------------------------- */

// given a path, create an array of node_module paths for it
// borrowed from substack/resolve (above)
function b_nodeModulesPaths(start, cb?) {
  var splitRe = process.platform === "win32" ? /[\/\\]/ : /\/+/;
  var parts = start.split(splitRe);

  var dirs = [];
  for (var i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === "node_modules") continue;
    var dir = path.join.apply(path, parts.slice(0, i + 1).concat(["node_modules"]));
    if (!parts[0].match(/([A-Za-z]:)/)) {
      dir = "/" + dir;
    }
    dirs.push(dir);
  }
  return dirs;
}

function find_shims_in_package(pkgJson, cur_path, shims, browser) {
  try {
    var info = JSON.parse(pkgJson);
  } catch (err) {
    err.message = pkgJson + " : " + err.message;
    throw err;
  }

  var replacements = getReplacements(info, browser);

  // no replacements, skip shims
  if (!replacements) {
    return;
  }

  // if browser mapping is a string
  // then it just replaces the main entry point
  if (typeof replacements === "string") {
    var key = path.resolve(cur_path, info.main || "index.js");
    shims[key] = path.resolve(cur_path, replacements);
    return;
  }

  // http://nodejs.org/api/modules.html#modules_loading_from_node_modules_folders
  Object.keys(replacements).forEach(function (key) {
    var val;
    if (replacements[key] === false) {
      val = path.normalize(__dirname + "/empty.js");
    } else {
      val = replacements[key];
      // if target is a relative path, then resolve
      // otherwise we assume target is a module
      if (val[0] === ".") {
        val = path.resolve(cur_path, val);
      }
    }

    if (key[0] === "/" || key[0] === ".") {
      // if begins with / ../ or ./ then we must resolve to a full path
      key = path.resolve(cur_path, key);
    }
    shims[key] = val;
  });

  [".js", ".json"].forEach(function (ext) {
    Object.keys(shims).forEach(function (key) {
      if (!shims[key + ext]) {
        shims[key + ext] = shims[key];
      }
    });
  });
}

// paths is mutated
// load shims from first package.json file found
function load_shims(paths, browser, cb) {
  // identify if our file should be replaced per the browser field
  // original filename|id -> replacement
  var shims = Object.create(null);

  (function next() {
    var cur_path = paths.shift();
    if (!cur_path) {
      return cb(null, shims);
    }

    var pkg_path = path.join(cur_path, "package.json");

    fs.readFile(pkg_path, "utf8", function (err, data) {
      if (err) {
        // ignore paths we can't open
        // avoids an exists check
        if (err.code === "ENOENT") {
          return next();
        }

        return cb(err);
      }
      try {
        find_shims_in_package(data, cur_path, shims, browser);
        return cb(null, shims);
      } catch (err) {
        return cb(err);
      }
    });
  })();
}

// paths is mutated
// synchronously load shims from first package.json file found
function load_shims_sync(paths, browser) {
  // identify if our file should be replaced per the browser field
  // original filename|id -> replacement
  var shims = Object.create(null);
  var cur_path;

  while ((cur_path = paths.shift())) {
    var pkg_path = path.join(cur_path, "package.json");

    try {
      var data = fs.readFileSync(pkg_path, "utf8");
      find_shims_in_package(data, cur_path, shims, browser);
      return shims;
    } catch (err) {
      // ignore paths we can't open
      // avoids an exists check
      if (err.code === "ENOENT") {
        continue;
      }

      throw err;
    }
  }
  return shims;
}

function build_resolve_opts(opts, base) {
  var packageFilter = opts.packageFilter;
  var browser = normalizeBrowserFieldName(opts.browser);

  opts.basedir = base;
  opts.packageFilter = function (info, pkgdir) {
    if (packageFilter) info = packageFilter(info, pkgdir);

    var replacements = getReplacements(info, browser);

    // no browser field, keep info unchanged
    if (!replacements) {
      return info;
    }

    info[browser] = replacements;

    // replace main
    if (typeof replacements === "string") {
      info.main = replacements;
      return info;
    }

    var replace_main = replacements[info.main || "./index.js"] || replacements["./" + info.main || "./index.js"];

    info.main = replace_main || info.main;
    return info;
  };

  var pathFilter = opts.pathFilter;
  opts.pathFilter = function (info, resvPath, relativePath) {
    if (relativePath[0] != ".") {
      relativePath = "./" + relativePath;
    }
    var mappedPath;
    if (pathFilter) {
      mappedPath = pathFilter.apply(this, arguments);
    }
    if (mappedPath) {
      return mappedPath;
    }

    var replacements = info[browser];
    if (!replacements) {
      return;
    }

    mappedPath = replacements[relativePath];
    if (!mappedPath && path.extname(relativePath) === "") {
      mappedPath = replacements[relativePath + ".js"];
      if (!mappedPath) {
        mappedPath = replacements[relativePath + ".json"];
      }
    }
    return mappedPath;
  };

  return opts;
}

function bresolve(id, opts, cb) {
  // opts.filename
  // opts.paths
  // opts.modules
  // opts.packageFilter

  opts = opts || {};
  opts.filename = opts.filename || "";

  var base = path.dirname(opts.filename);

  if (opts.basedir) {
    base = opts.basedir;
  }

  var paths = b_nodeModulesPaths(base);

  if (opts.paths) {
    paths.push.apply(paths, opts.paths);
  }

  paths = paths.map(function (p) {
    return path.dirname(p);
  });

  // we must always load shims because the browser field could shim out a module
  load_shims(paths, opts.browser, function (err, shims) {
    if (err) {
      return cb(err);
    }

    var resid = path.resolve(opts.basedir || path.dirname(opts.filename), id);
    if (shims[id] || shims[resid]) {
      var xid = shims[id] ? id : resid;
      // if the shim was is an absolute path, it was fully resolved
      if (shims[xid][0] === "/") {
        return resolve(shims[xid], build_resolve_opts(opts, base), function (err, full, pkg) {
          cb(null, full, pkg);
        });
      }

      // module -> alt-module shims
      id = shims[xid];
    }

    var modules = opts.modules || Object.create(null);
    var shim_path = modules[id];
    if (shim_path) {
      return cb(null, shim_path);
    }

    // our browser field resolver
    // if browser field is an object tho?
    var full = resolve(id, build_resolve_opts(opts, base), function (err, full, pkg) {
      if (err) {
        return cb(err);
      }

      var resolved = shims ? shims[full] || full : full;
      cb(null, resolved, pkg);
    });
  });
}

bresolve.sync = function (id, opts) {
  // opts.filename
  // opts.paths
  // opts.modules
  // opts.packageFilter

  opts = opts || {};
  opts.filename = opts.filename || "";

  var base = path.dirname(opts.filename);

  if (opts.basedir) {
    base = opts.basedir;
  }

  var paths = b_nodeModulesPaths(base);

  if (opts.paths) {
    paths.push.apply(paths, opts.paths);
  }

  paths = paths.map(function (p) {
    return path.dirname(p);
  });

  // we must always load shims because the browser field could shim out a module
  var shims = load_shims_sync(paths, opts.browser);
  var resid = path.resolve(opts.basedir || path.dirname(opts.filename), id);

  if (shims[id] || shims[resid]) {
    var xid = shims[id] ? id : resid;
    // if the shim was is an absolute path, it was fully resolved
    if (shims[xid][0] === "/") {
      return resolve.sync(shims[xid], build_resolve_opts(opts, base));
    }

    // module -> alt-module shims
    id = shims[xid];
  }

  var modules = opts.modules || Object.create(null);
  var shim_path = modules[id];
  if (shim_path) {
    return shim_path;
  }

  // our browser field resolver
  // if browser field is an object tho?
  var full = resolve.sync(id, build_resolve_opts(opts, base));

  return shims ? shims[full] || full : full;
};

function normalizeBrowserFieldName(browser) {
  return browser || "browser";
}

function getReplacements(info, browser) {
  browser = normalizeBrowserFieldName(browser);
  var replacements = info[browser] || info.browser;

  // support legacy browserify field for easier migration from legacy
  // many packages used this field historically
  if (typeof info.browserify === "string" && !replacements) {
    replacements = info.browserify;
  }

  return replacements;
}

export { resolve, bresolve };

//module.exports = resolve
//module.exports.resolve = resolve;
