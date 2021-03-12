const {browserify, sucrasify, createDevServer, HotReloadPlugin, tinyify, envify, aliasify} = require("./tools/omnify")


//
// ─── HOT DEV SERVER ─────────────────────────────────────────────────────────────
//

const omnify_serve_hot = () => {
  var fs = require("fs")

  let srcWatcher = fs.watch("src", {recursive: true})
  let isChanging = false
  let secondRun = false

  srcWatcher.once("change", () => {
    secondRun = true
  })
  //ts-server / vscode causes multiple change events, so using a debounce variable
  srcWatcher.on("change", () => {
    if (!isChanging) {
      isChanging = true
      console.time("WATCHIFY:BUNDLECHANGE")
    }
  })

  var bundler = browserify("src/index.tsx", {
    cache: {},
    packageCache: {},
    debug: true,
    sourceMaps: false,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    plugin: [HotReloadPlugin],
    transform: [
      //have to run as a global transform because some of the libs in the preact demo are using esm 
      [sucrasify.configure({hot: true}), {global: true}]
    ]
  })

  bundler.on("bundle", () => {
    if (secondRun) {
      console.timeEnd("WATCHIFY:BUNDLECHANGE")
      isChanging = false
    }
  })

  return createDevServer({
    browserify_instance: bundler,
    static_url: "main.js"
  })
}

//
// ─── REGULAR OMNIFY ─────────────────────────────────────────────────────────────
//

const omnify = () => {
  var fs = require("fs")
  console.time("OMNIFY:BUNDLETIME")

  var bundler = browserify("src/index.tsx", {
    cache: {},
    packageCache: {},
    debug: true,
    sourceMaps: false,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    transform: [
      sucrasify
    ]
  })

  bundler.bundle().pipe(fs.createWriteStream("public/app.js").on("close", () => console.timeEnd("OMNIFY:BUNDLETIME")))
}


//
// ─── OMNIFY WITH TERSER AND THINGS ──────────────────────────────────────────────
//

const omnify_bundle_minify = () => {
  var fs = require("fs")
  //var shakeify = require("common-shakeify")
  //var packflat = require("browser-pack-flat/plugin")

  console.time("OMNIFY:BUNDLETIME")
  var bundler = browserify("src/index.tsx", {
    cache: {},
    packageCache: {},
    debug: true,
    sourceMaps: false,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    plugin: [
      //shakeify,
      //packflat,
      tinyify
    ],
    transform: [
      sucrasify,
      [envify({NODE_ENV: "production"}), {global: true}]


      // [
      //   aliasify.configure({
      //     aliases: {
      //       "react": "react/cjs/react.production.min.js",
      //       "react-dom": "react-dom/cjs/react-dom.production.min.js",
      //       "scheduler": "scheduler/cjs/scheduler.production.min.js",
      //       "react-reconciler":"react-reconciler/cjs/react-reconciler.production.min.js"
      //       //"react": "preact/compat",
      //       //"react-dom": "preact/compat"
      //     },
      //     appliesTo: { includeExtensions: [".js", ".jsx", ".tsx", ".ts"] },
      //   }),
      //   { global: true },
      // ]

    ]
  })

  bundler.bundle().pipe(fs.createWriteStream("public/app.js").on("close", () => console.timeEnd("OMNIFY:BUNDLETIME")))
}

//
// ─── STANDARD ESBUILD ────────────────────────────────────────────────────────────
//

const esbuild = () => {
  const _esbuild = require("esbuild")
  //const {lessLoader} = require("esbuild-plugin-less")
  async function build() {
    console.time("ESBUILD:BUNDLETIME")
    await _esbuild.build({
      define: {
        "process.env.NODE_ENV": '"production"'
      },
      bundle: true,
      minify: true,
      loader: {
        ".svg": "file"
      },
      //plugins: [lessLoader()],
      outdir: "public",
      entryPoints: ["src/index.tsx"],
      platform: "browser"
    })
    console.timeEnd("ESBUILD:BUNDLETIME")
  }
  build()
}

//
// ─── ESBUILD BUILTIN DEVSERVER (NEEDS PERMISSION) ─────────────────────────────────
//

const esbuild_serve = () => {
  require("esbuild")
    .serve(
      {
        servedir: "public"
      },
      {
        define: {
          "process.env.NODE_ENV": '"production"'
        },
        entryPoints: ["src/index.tsx"],
        outdir: "public",
        bundle: true,
        minify: true
      }
    )
    .then((server) => {
      // Call "stop" on the web server when you're done
      console.log("probably listing on https://localhost:8000")
      process.on("exit", () => {
        server.stop()
      })
    })
}

const args = process.argv.slice(2)

args.forEach((arg) => console.info(arg))

args.includes("--esbuild") && esbuild()
args.includes("--omnify") && omnify()
args.includes("--minify-omnify") && omnify_bundle_minify()
args.includes("--serve") && omnify_serve_hot()
args.includes("--serve-esbuild") && esbuild_serve()

//default for "node start.js"
args[0] == null && omnify_serve_hot()