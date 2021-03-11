import fs from "fs"
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "http"
import { join, resolve } from "path"
import { mime } from "./mime"

//var mime = new Mime(require("./mime_standard.js"))

const FILES = {}
const noop = () => {}

/* -------------------------------------------------------------------------- */
/*                                 @polka/url                                 */
/* -------------------------------------------------------------------------- */

type Req = IncomingMessage & {
  path?: string
  pathname?: string
  url?: any
  _parsedUrl?: any
  [key: string]: any
}

function parser(req: Req) {
  let url = req.url
  if (url === void 0) return url

  let obj = req._parsedUrl
  if (obj && obj._raw === url) return obj

  obj = {}
  obj.query = obj.search = null
  obj.href = obj.path = obj.pathname = url

  let idx = url.indexOf("?", 1)
  if (idx !== -1) {
    obj.search = url.substring(idx)
    obj.query = obj.search.substring(1)
    obj.pathname = url.substring(0, idx)
  }

  obj._raw = url

  return (req._parsedUrl = obj)
}

function toAssume(uri: string, extns: string | any[]) {
  let i = 0
  var x: string
  var len = uri.length - 1
  if (uri.charCodeAt(len) === 47) {
    uri = uri.substring(0, len)
  }

  let arr = [],
    tmp = `${uri}/index`
  for (; i < extns.length; i++) {
    x = "." + extns[i]
    if (uri) arr.push(uri + x)
    arr.push(tmp + x)
  }

  return arr
}

function find(uri: string, extns: string | any[]) {
  let i = 0
  var data: any
  var arr = toAssume(uri, extns)
  for (; i < arr.length; i++) {
    if ((data = FILES[arr[i]])) return data
  }
}

function is404(req: any, res: { statusCode: number; end: () => any }) {
  return (res.statusCode = 404), res.end()
}

function list(
  dir: string,
  fn: { (name: any, abs: any, stats: any): void; (arg0: string, arg1: string, arg2: fs.Stats): any },
  pre = ""
) {
  let i = 0
  var abs: fs.PathLike
  var stats: fs.Stats
  let arr = fs.readdirSync(dir)
  for (; i < arr.length; i++) {
    abs = join(dir, arr[i])
    stats = fs.statSync(abs)
    stats.isDirectory() ? list(abs, fn, join(pre, arr[i])) : fn(join(pre, arr[i]), abs, stats)
  }
}

type SendOptions = Partial<{
  start: any
  end: any
}>

function send(
  req: IncomingMessage & { path?: string; pathname?: string },
  res: ServerResponse,
  file: fs.PathLike,
  stats: { size: number },
  headers: OutgoingHttpHeaders = {}
) {
  let code = 200
  let opts: SendOptions = {}

  if (req.headers.range) {
    code = 206
    let [x, y] = req.headers.range.replace("bytes=", "").split("-")
    let end = (opts.end = parseInt(y, 10) || stats.size - 1)
    let start = (opts.start = parseInt(x, 10) || 0)

    if (start >= stats.size || end >= stats.size) {
      res.setHeader("Content-Range", `bytes */${stats.size}`)
      res.statusCode = 416
      return res.end()
    }

    headers["Content-Range"] = `bytes ${start}-${end}/${stats.size}`
    headers["Content-Length"] = end - start + 1
    headers["Accept-Ranges"] = "bytes"
  }

  res.writeHead(code, headers)
  fs.createReadStream(file, opts).pipe(res)
}

/* -------------------------------------------------------------------------- */
/*                                    sirv                                    */
/* -------------------------------------------------------------------------- */

type SirvOptions = Partial<{
  onNoMatch: typeof is404
  extensions: string[]
  setHeaders: any
  dev: boolean
  maxAge: number
  immutable: boolean
  dotfiles: boolean
  etag: any
}>

function sirv(dir: string, opts: SirvOptions = {}) {
  dir = resolve(dir || ".")

  let isNotFound = opts.onNoMatch || is404
  let extensions = opts.extensions || ["html", "htm"]
  let setHeaders = opts.setHeaders || noop

  if (opts.dev) {
    return function (
      req: IncomingMessage & { path?: string; pathname?: string },
      res: ServerResponse,
      next: () => any
    ) {
      let stats: fs.Stats
      let file: fs.PathLike
      let uri = decodeURIComponent(req.path || req.pathname || parser(req).pathname)
      let arr = [uri]
        .concat(toAssume(uri, extensions))
        .map((x) => join(dir, x))
        .filter(fs.existsSync)
      while ((file = arr.shift())) {
        stats = fs.statSync(file)
        if (stats.isDirectory()) continue
        setHeaders(res, uri, stats)
        return send(req, res, file, stats, {
          "Content-Type": mime.getType(file),
          "Last-Modified": stats.mtime.toUTCString(),
          "Content-Length": stats.size,
        })
      }
      return next ? next() : isNotFound(req, res)
    }
  }

  let cc = opts.maxAge != null && `public,max-age=${opts.maxAge}`
  if (cc && opts.immutable) cc += ",immutable"

  list(dir, (name: string, abs: any, stats: { size: any; mtime: { toUTCString: () => any; getTime: () => any } }) => {
    if (!opts.dotfiles && name.charAt(0) === ".") {
      return
    }

    let headers = {
      "Content-Length": stats.size,
      "Content-Type": mime.getType(name),
      "Last-Modified": stats.mtime.toUTCString(),
    }

    if (cc) headers["Cache-Control"] = cc
    if (opts.etag) headers["ETag"] = `W/"${stats.size}-${stats.mtime.getTime()}"`

    FILES["/" + name.replace(/\\+/g, "/")] = { abs, stats, headers }
  })

  return function (
    req: Req | (IncomingMessage & { path?: string; pathname?: string }),
    res: ServerResponse,
    next: () => any
  ) {
    let pathname = decodeURIComponent(req.path || req.pathname || parser(req).pathname)
    let data = FILES[pathname] || find(pathname, extensions)
    if (!data) return next ? next() : isNotFound(req, res)

    setHeaders(res, pathname, data.stats)
    send(req, res, data.abs, data.stats, data.headers)
  }
}

export { sirv }
