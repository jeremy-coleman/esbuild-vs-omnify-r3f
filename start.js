  var fs = require("fs")
const {
  browserify,
  sucrasify,
  createDevServer,
  HotReloadPlugin,
  tinyify,
  envify,
  aliasify,
  getFileSize
} = require("./tools/omnify")


const serve = () => {
  var bundler = browserify("src/index.tsx", {
    cache: {},
    packageCache: {},
    debug: false,
    sourceMaps: false,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    plugin: [HotReloadPlugin],
    transform: [
      [sucrasify.configure({ hot: true })],
      //[envify({ NODE_ENV: "production" }), { global: true }],
      [
        aliasify.configure({
          aliases: {
            "react": "react/cjs/react.production.min.js",
            "react-dom": "react-dom/cjs/react-dom.production.min.js",
            "scheduler": "scheduler/cjs/scheduler.production.min.js",
            "react-reconciler": "react-reconciler/cjs/react-reconciler.production.min.js"
          },
          appliesTo: { includeExtensions: [".js", ".jsx", ".tsx", ".ts"] }
        }),
        { global: true }
      ]
    ]
  })

  createDevServer({
    browserify_instance: bundler,
    static_url: "main.js"
  })

}


const bundle = () => {
  fs.mkdirSync("public", { recursive: true })
  //var shakeify = require("common-shakeify")
  //var packflat = require("browser-pack-flat/plugin")

  console.time("OMNIFY:BUNDLETIME")

  var bundler = browserify("src/index.tsx", {
    cache: {},
    packageCache: {},
    debug: false,
    sourceMaps: false,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    plugin: [
      //tinyify,
      //shakeify
    ],
    transform: [
      sucrasify,
      //[envify({ NODE_ENV: "production" }), { global: true }],
      // [
      //   aliasify.configure({
      //     aliases: {
      //       "react": "react/cjs/react.production.min.js",
      //       "react-dom": "react-dom/cjs/react-dom.production.min.js",
      //       "scheduler": "scheduler/cjs/scheduler.production.min.js",
      //       "react-reconciler": "react-reconciler/cjs/react-reconciler.production.min.js"
      //     },
      //     appliesTo: { includeExtensions: [".js", ".jsx", ".tsx", ".ts"] }
      //   }),
      //   { global: true }
      // ]
    ]
  })

  bundler
    .bundle()
    .pipe(fs.createWriteStream("public/app.js"))
    .on("close", () => {
      console.timeEnd("OMNIFY:BUNDLETIME")
      console.log(getFileSize("public/app.js"))
    })
}

const args = process.argv.slice(2)

args.includes("--serve") && serve()
args.includes("--bundle") && bundle()

//default
args[0] == null && serve()
