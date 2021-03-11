

import { Readable } from 'stream'
// import { from2 } from './from2'

// // create a stream from a string
// // str -> stream
// function fromString (string) {
//   return from2(function (size, next) {
//     if (string.length <= 0) return this.push(null)

//     const chunk = string.slice(0, size)
//     string = string.slice(size)

//     next(null, chunk)
//   })
// }



// create a stream from a string
// str -> stream
function fromString (string: string) {
  var rs = new Readable({objectMode: true})
  if (string.length <= 0) {
   rs.push(null)
   return rs
  }
  rs.push(string)
  rs.push(null)
  return rs
}

export { fromString }
