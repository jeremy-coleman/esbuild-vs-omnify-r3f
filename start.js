const {browserify, sucrasify, createDevServer, HotReloadPlugin} = require("./tools/omnify")

var bundler = browserify("src/index.tsx", {
  cache: {},
  packageCache: {},
  debug: true,
  sourceMaps: false,
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  transform: [sucrasify]
})

const serve = () => {
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
    transform: [sucrasify.configure({hot: true})]
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

const omnify = () => {
  var fs = require("fs")
  console.time("OMNIFY:BUNDLETIME")
  var bundler = browserify("src/index.tsx", {
    cache: {},
    packageCache: {},
    debug: true,
    sourceMaps: false,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    transform: [sucrasify]
  })

  bundler.bundle().pipe(fs.createWriteStream("public/app.js").on("close", () => console.timeEnd("OMNIFY:BUNDLETIME")))
}

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

const args = process.argv.slice(2)

args.forEach((arg) => console.info(arg))

args.includes("--esbuild") && esbuild()
args.includes("--omnify") && omnify()
//args.includes("--watch") && watch()
args.includes("--serve") && serve()
