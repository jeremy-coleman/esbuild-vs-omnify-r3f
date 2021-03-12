const {browserify, sucrasify, createDevServer, HotReloadPlugin, tinyify, envify, aliasify} = require("./tools/omnify")

const omnify = () => {
    var fs = require("fs")
    var swcify = require("./swcify")

    console.time("OMNIFY:BUNDLETIME")
  
    var bundler = browserify("src/index.tsx", {
      cache: {},
      packageCache: {},
      debug: true,
      sourceMaps: false,
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      transform: [
          swcify,
          //sucrasify
        ]
    })
  
    bundler.bundle().pipe(fs.createWriteStream("public/app.js").on("close", () => console.timeEnd("OMNIFY:BUNDLETIME")))
  }

  omnify()