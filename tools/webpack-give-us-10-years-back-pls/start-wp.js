const webpack = require("webpack")

//you probably want to use serve instead
const watch = () => {
  const config = require("./webpack.dev.js")
  const compiler = webpack(config)

  var compiler_state_started = false
  compiler.watch({}, (err, stats) => {
    if (!err && !stats.hasErrors() && !compiler_state_started) {
      compiler_state_started = true
      if (err) {
        console.warn(err)
      }
    }
  })
}

//npx serve public to confirm app works with prod build
const build = () => {
  const config = require("./webpack.production.js")
  const compiler = webpack(config)

  compiler.run((err, stats) => {
    if (!err && !stats.hasErrors()) {
      if (err) {
        console.warn(err)
      }
    }
  })
}

const serve = () => {
  const {polka} = require("./tools/polka")
  const config = require("./webpack.dev.js")
  const app = polka()
  const compiler = webpack(config)

  app.use(
    require("webpack-dev-middleware")(compiler, {
      publicPath: config.output.publicPath
    })
  )

  app.use(require("webpack-hot-middleware")(compiler))

  app.listen(8888, () => {
    console.log("listening on http://localhost:8888")
  })

  //put some json data in api/data.json and uncomment this if you'd like to serve some data
  // app.use('/api', function(req, res) {
  //     res.header("Content-Type",'application/json');
  //     res.sendFile(path.join(__dirname, './api/data.json'));
  // })
}

const args = process.argv.slice(2)

args.forEach((arg) => console.info(arg))

args.includes("--build") && build()
args.includes("--watch") && watch()
args.includes("--serve") && serve()

/**
 * Notes
 * console.log(process.argv)
 * argv[0] is node.exe and argv[1] is this file's path, so argv.slice(2) filters them out
 *
 */
