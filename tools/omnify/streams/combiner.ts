import { PassThrough, Readable } from "stream"
import { DuplexWrapper } from "./duplexer"

function StreamCombiner(...args) {
  var streams
  if (args.length == 1 && Array.isArray(args[0])) {
    streams = args[0]
  } else {
    streams = [].slice.call(args)
  }
  return combine(streams)
}

StreamCombiner.obj = function (...args) {
  var streams
  if (args.length == 1 && Array.isArray(args[0])) {
    streams = args[0]
  } else {
    streams = [].slice.call(args)
  }
  return combine(streams, { objectMode: true })
}

function combine(streams, opts?) {
  for (var i = 0; i < streams.length; i++) streams[i] = wrap(streams[i], opts)

  if (streams.length == 0) return new PassThrough(opts)
  else if (streams.length == 1) return streams[0]

  var first = streams[0],
    last = streams[streams.length - 1],
    thepipe = new DuplexWrapper(first, last, opts)

  //pipe all the streams together

  function recurse(streams) {
    if (streams.length < 2) return
    streams[0].pipe(streams[1])
    recurse(streams.slice(1))
  }

  recurse(streams)

  function onerror(...args) {
    //var args = [].slice.call(arguments)
    args.unshift("error")
    thepipe.emit.apply(thepipe, args)
  }

  //es.duplex already reemits the error from the first and last stream.
  //add a listener for the inner streams in the pipeline.
  for (var i = 1; i < streams.length - 1; i++) streams[i].on("error", onerror)

  return thepipe
}

function wrap(tr, opts) {
  if (typeof tr.read === "function") return tr
  return new Readable(opts).wrap(tr)
}

export { StreamCombiner }
