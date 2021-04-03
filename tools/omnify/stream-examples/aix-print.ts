import fs from "fs"

//https://nodejs.org/api/stream.html#stream_streams_compatibility_with_async_generators_and_async_iterators

async function print(readable) {
  readable.setEncoding("utf8")
  let data = ""
  for await (const chunk of readable) {
    data += chunk
  }
  console.log(data)
}

print(fs.createReadStream("file")).catch(console.error)
