import * as HTTP from "http"
import { parse } from "querystring"

/* -------------------------------------------------------------------------- */
/*                                   matchit                                  */
/* -------------------------------------------------------------------------- */

const SEP = "/"
// Types ~> static, param, any, optional
const STYPE = 0
const PTYPE = 1
const ATYPE = 2
const OTYPE = 3
// Char Codes ~> / : *
const SLASH = 47
const COLON = 58
const ASTER = 42
const QMARK = 63

function every(arr: string | any[], cb: CallableFunction) {
  var i = 0
  var len = arr.length

  for (; i < len; i++) {
    if (!cb(arr[i], i, arr)) {
      return false
    }
  }

  return true
}

function strip(str: string) {
  if (str === SEP) return str
  str.charCodeAt(0) === SLASH && (str = str.substring(1))
  var len = str.length - 1
  return str.charCodeAt(len) === SLASH ? str.substring(0, len) : str
}

function split(str: string) {
  return (str = strip(str)) === SEP ? [SEP] : str.split(SEP)
}

function isMatch(arr: { [x: string]: any }, obj: { val: any; type: number; end: any }, idx: string) {
  idx = arr[idx]
  return (
    (obj.val === idx && obj.type === STYPE) ||
    (idx === SEP ? obj.type > PTYPE : obj.type !== STYPE && (idx || "").endsWith(obj.end))
  )
}

function match(str: string, all: string | any[]) {
  var i = 0
  var tmp: string | any[]
  var segs = split(str)
  var len = segs.length
  var l: number
  var fn = isMatch.bind(isMatch, segs)

  for (; i < all.length; i++) {
    tmp = all[i]
    if ((l = tmp.length) === len || (l < len && tmp[l - 1].type === ATYPE) || (l > len && tmp[l - 1].type === OTYPE)) {
      if (every(tmp, fn)) return tmp
    }
  }

  return []
}

function parseRoutes(str: string) {
  if (str === SEP) {
    return [{ old: str, type: STYPE, val: str, end: "" }]
  }

  var c: number
  var x: number
  var t: number
  var sfx: string | any[]
  var nxt = strip(str)
  var i = -1
  var j = 0
  var len = nxt.length
  var out = []

  while (++i < len) {
    c = nxt.charCodeAt(i)

    if (c === COLON) {
      j = i + 1 // begining of param
      t = PTYPE // set type
      x = 0 // reset mark
      sfx = ""

      while (i < len && nxt.charCodeAt(i) !== SLASH) {
        c = nxt.charCodeAt(i)
        if (c === QMARK) {
          x = i
          t = OTYPE
        } else if (c === 46 && sfx.length === 0) {
          sfx = nxt.substring((x = i))
        }
        i++ // move on
      }

      out.push({
        old: str,
        type: t,
        val: nxt.substring(j, x || i),
        end: sfx,
      })

      // shorten string & update pointers
      nxt = nxt.substring(i)
      len -= i
      i = 0

      // loop
      continue
    } else if (c === ASTER) {
      out.push({
        old: str,
        type: ATYPE,
        val: nxt.substring(i),
        end: "",
      })

      // loop
      continue
    } else {
      j = i
      while (i < len && nxt.charCodeAt(i) !== SLASH) {
        // skip to next slash
        ++i
      }

      out.push({
        old: str,
        type: STYPE,
        val: nxt.substring(j, i),
        end: "",
      })

      // shorten string & update pointers
      nxt = nxt.substring(i)
      len -= i
      i = j = 0
    }
  }

  return out
}

function exec(str: any, arr: string | any[]) {
  var i = 0
  var x: string
  var y: { type: number; val: string | number; end: any }
  var segs = split(str)
  var out = {}
  for (; i < arr.length; i++) {
    x = segs[i]
    y = arr[i]
    if (x === SEP) continue
    // @ts-ignore
    if (x !== void 0 && y.type | (2 === OTYPE)) {
      out[y.val] = x.replace(y.end, "")
    }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*                                 @polka/url                                 */
/* -------------------------------------------------------------------------- */

type R = { url: any; _parsedUrl: any }

//this decorates a req object with _parsedUrl

function parser(req: R) {
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

function lead(x: string) {
  return x.charCodeAt(0) === 47 ? x : "/" + x
}

function value(x: string) {
  let y = x.indexOf("/", 1)
  return y > 1 ? x.substring(0, y) : x
}

function mutate(str: string | any[], req: { url: string; path: string }) {
  req.url = req.url.substring(str.length) || "/"
  req.path = req.path.substring(str.length) || "/"
}

function onError(
  err: { code: any; status: any; length: any; message: any },
  req: Request,
  res: { statusCode: any; end: (arg0: any) => void },
  next: any
) {
  let code = (res.statusCode = err.code || err.status || 500)
  res.end((err.length && err) || err.message || HTTP.STATUS_CODES[code])
}

/* -------------------------------------------------------------------------- */
/*                                    polka                                   */
/* -------------------------------------------------------------------------- */

type PolkaOptions = {
  server?: HTTP.Server
  onError?: (err: any, req: any, res: any, next: any) => void
  onNoMatch?: unknown
}

class Polka {
  opts: {}
  routes: {}
  handlers: {}
  all: any
  get: any
  head: any
  patch: any
  options: any
  connect: any
  delete: any
  trace: any
  post: any
  put: any
  apps: {}
  wares: any[]
  bwares: {}
  parse: (req: any) => any
  server: any
  onError: any
  onNoMatch: any

  constructor(opts: PolkaOptions = {}) {
    this.opts = opts
    this.routes = {}
    this.handlers = {}

    this.all = this.add.bind(this, "*")
    this.get = this.add.bind(this, "GET")
    this.head = this.add.bind(this, "HEAD")
    this.patch = this.add.bind(this, "PATCH")
    this.options = this.add.bind(this, "OPTIONS")
    this.connect = this.add.bind(this, "CONNECT")
    this.delete = this.add.bind(this, "DELETE")
    this.trace = this.add.bind(this, "TRACE")
    this.post = this.add.bind(this, "POST")
    this.put = this.add.bind(this, "PUT")

    this.apps = {}
    this.wares = []
    this.bwares = {}
    this.parse = parser
    this.server = opts.server
    this.handler = this.handler.bind(this)
    this.onError = opts.onError || onError // catch-all handler
    this.onNoMatch = opts.onNoMatch || this.onError.bind(null, { code: 404 })
  }

  add(method: string, pattern: string, ...fns: any[]) {
    // Save decoded pattern info
    let base = lead(value(pattern))
    if (this.apps[base] !== void 0)
      throw new Error(
        `Cannot mount ".${method.toLowerCase()}('${lead(
          pattern
        )}')" because a Polka application at ".use('${base}')" already exists! You should move this handler into your Polka application instead.`
      )

    if (this.routes[method] === void 0) this.routes[method] = []
    this.routes[method].push(parseRoutes(String(pattern)))
    // Save route handler(s)
    if (this.handlers[method] === void 0) this.handlers[method] = {}
    this.handlers[method][pattern] = fns

    // chainable
    return this
  }

  find(method: string, url: any) {
    let arr = match(url, this.routes[method] || [])
    if (arr.length === 0) {
      arr = match(url, this.routes[(method = "*")] || [])
      if (!arr.length) return false
    }
    return {
      params: exec(url, arr),
      handlers: this.handlers[method][arr[0].old],
    }
  }

  use(base: string, ...fns: any[]) {
    if (typeof base === "function") {
      this.wares = this.wares.concat(base, fns)
    } else if (base === "/") {
      this.wares = this.wares.concat(fns)
    } else {
      base = lead(base)
      fns.forEach((fn) => {
        if (fn instanceof Polka) {
          this.apps[base] = fn
        } else {
          let arr = this.bwares[base] || []
          arr.length > 0 || arr.push((r, _, nxt) => (mutate(base, r), nxt()))
          this.bwares[base] = arr.concat(fn)
        }
      })
    }
    // chainable
    return this
  }

  listen() {
    ;(this.server = this.server || HTTP.createServer()).on("request", this.handler)
    this.server.listen.apply(this.server, arguments)
    return this
  }

  handler(
    req: { method?: any; originalUrl?: any; url: any; path: any; params?: any; search?: any; query?: any },
    res: { finished: any },
    info: { pathname: any; search: any; query: any }
  ) {
    info = info || this.parse(req)
    let fns = [],
      arr = this.wares,
      obj = this.find(req.method, info.pathname)
    req.originalUrl = req.originalUrl || req.url
    let base = value((req.path = info.pathname))
    if (this.bwares[base] !== void 0) {
      arr = arr.concat(this.bwares[base])
    }
    if (obj) {
      fns = obj.handlers
      req.params = obj.params
    } else if (this.apps[base] !== void 0) {
      mutate(base, req)
      info.pathname = req.path //=> updates
      fns.push(this.apps[base].handler.bind(null, req, res, info))
    } else if (fns.length === 0) {
      fns.push(this.onNoMatch)
    }
    // Grab addl values from `info`
    req.search = info.search
    req.query = parse(info.query)
    // Exit if only a single function
    let i = 0,
      len = arr.length,
      num = fns.length
    if (len === i && num === 1) return fns[0](req, res)
    // Otherwise loop thru all middlware
    let next = (err) => (err ? this.onError(err, req, res, next) : loop())
    let loop = () => res.finished || (i < len && arr[i++](req, res, next))
    arr = arr.concat(fns)
    len += num
    loop() // init
  }
}

const polka = (opts) => new Polka(opts)

module.exports = { polka }
