import http from "http"
import {createHtml as defaultIndex} from "../streams/simple-html-index"
import {emitter as createWatchifyEmitter} from "./watchify-middleware"

function createDevServer({browserify_instance, static_url = "main.js", devServer = {port: 8000}}) {
  var watcher = createWatchifyEmitter(browserify_instance, {
    errorHandler: true
  })
  function handler(req, res) {
    if (req.url === "/") {
      defaultIndex({entry: static_url}).pipe(res)
    } else if (req.url === `/${static_url}`) {
      watcher.middleware(req, res)
    }
  }

  var server = http.createServer()

  server.on("request", handler)

  server.listen(devServer.port, "localhost", function () {
    console.log(`Listening on http://localhost:${devServer.port}/`)
  })

  return server
}

export {createDevServer}
