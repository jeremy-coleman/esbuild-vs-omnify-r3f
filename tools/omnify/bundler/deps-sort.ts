import { Transform } from "stream"
import { shasum } from "./shasum"

type DepsSortOptions = {
  expose?: {} | []
  dedupe?: any
  index?: any
}

export function depsSort(opts: { expose?: {} | []; dedupe?: any; index?: any }) {
  if (!opts) opts = {}
  var rows = []

  return new Transform({
    objectMode: true,
    write: function write(row, enc, next) {
      rows.push(row)
      next()
    },

    flush: function flush() {
      rows.sort((a: { id: any; hash: any }, b: { id: any; hash: any }) => {
        return a.id + a.hash < b.id + b.hash ? -1 : 1
      })

      var expose = opts.expose || {}
      if (Array.isArray(expose)) {
        expose = expose.reduce(function (acc, key) {
          acc[key] = true
          return acc
        }, {})
      }

      var hashes = {}
      var deduped = {}

      var _depsMap = new Map() //{}
      var _hashesMap = new Map() //{}

      function sameDepsAdd(row: { id: string | number; deps: any }, hash: any) {
        _depsMap.set(row.id, row.deps)
        _hashesMap.set(row.id, hash)
      }

      function sameDepsCmp(a: { [x: string]: any }, b: { [x: string]: any }, limit: number = undefined) {
        if (!a && !b) return true
        if (!a || !b) return false

        var keys = Object.keys(a)
        if (keys.length !== Object.keys(b).length) return false

        for (var i = 0; i < keys.length; i++) {
          var k = keys[i]
          var ka = a[k]
          var kb = b[k]
          var ha = _hashesMap.get(ka)
          var hb = _hashesMap.get(kb)
          var da = _depsMap.get(ka)
          var db = _depsMap.get(kb)

          if (ka === kb) continue
          if (ha !== hb || (!limit && !sameDepsCmp(da, db, 1))) {
            return false
          }
        }
        return true
      }

      if (opts.dedupe) {
        rows.forEach((row) => {
          var h = shasum(row.source)
          sameDepsAdd(row, h)
          if (hashes[h]) {
            hashes[h].push(row)
          } else {
            hashes[h] = [row]
          }
        })
        Object.keys(hashes).forEach((h) => {
          var rows = hashes[h]
          while (rows.length > 1) {
            var row = rows.pop()
            row.dedupe = rows[0].id
            row.sameDeps = sameDepsCmp(rows[0].deps, row.deps)
            deduped[row.id] = rows[0].id
          }
        })
      }

      if (opts.index) {
        var index = {}
        var offset = 0
        rows.forEach(function (row, ix) {
          if (row.id in expose) {
            //if (has(expose, row.id)) {
            row.index = row.id
            offset++
            if (expose[row.id] !== true) {
              index[expose[row.id]] = row.index
            }
          } else {
            row.index = ix + 1 - offset
          }
          index[row.id] = row.index
        })
        rows.forEach((row) => {
          row.indexDeps = {}
          Object.keys(row.deps).forEach((key) => {
            var id = row.deps[key]
            row.indexDeps[key] = index[id]
          })
          if (row.dedupe) {
            row.dedupeIndex = index[row.dedupe]
          }
          this.push(row)
        })
      } 
      else {
        rows.forEach((row) => {
          this.push(row)
        })
      }
      this.push(null)
    },
  })
}
