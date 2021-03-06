require("sucrase/register")

const { polka } = require("./http-server/polka")
const { sirv } = require("./http-server/sirv")

const { browserify } = require("./bundler/browserify")
const { watchify } = require("./bundler/watchify")

const { envify } = require("./transforms/loose-envify")

const { sucrasify } = require("./transforms/sucrasify")
const { tsify } = require("./transforms/tsify")

const { createDevServer } = require("./dev-server/create-dev-server")
const { HotReloadPlugin } = require("./plugins/hmr-plugin")

//const {babelify} = require("./transforms/babelify")
//const {lessify} = require("./transforms/lessify")

const { aliasify } = require("./transforms/aliasify")

const { tinyify } = require("./plugins/tinyify")

const {getFileSize} = require('./task-helpers')

module.exports = {
  
  getFileSize,

  browserify,
  watchify,
  createDevServer,
  polka,
  sirv,
  sucrasify,
  envify,
  tsify,
  HotReloadPlugin,

  tinyify,
  aliasify
  //lessify,
  //babelify,
}
