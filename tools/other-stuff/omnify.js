var fs = require("fs")
const { browserify, sucrasify, aliasify } = require("./tools/omnify")


function getFileSize(filePath) {
  var fs = require('fs')
  var size = fs.statSync(filePath).size;
  var i = Math.floor(Math.log(size) / Math.log(1024));
  return (
    (size / Number(Math.pow(1024, i))).toFixed(2) +
    " " +
    ["B", "KB", "MB", "GB", "TB"][i]
  );
}

var after_bundle = () => {
    console.timeEnd("BUNDLE:FAST")
    console.log(fs.statSync("./public/app.js"))
    console.log(getFileSize("./public/app.js"))
}

const fast = () => {
  var fs = require("fs")
  fs.mkdirSync("public", { recursive: true })

  console.time("BUNDLE:FAST")

  var bundler = browserify("src/index.tsx", {
    cache: {},
    packageCache: {},
    debug: false,
    sourceMaps: false,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    exposeAll: true,
    dedupe: false,
    transform: [
      sucrasify,
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
  bundler
    .bundle()
    .pipe(fs.createWriteStream("public/app.js"))
    .on("close", () => after_bundle())
}

const args = process.argv.slice(2)

args.includes("--fast") && fast()
