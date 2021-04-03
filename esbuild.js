var fs = require("fs")
const { getFileSize } = require("./tools/omnify")


const bundle = () => {
  fs.mkdirSync("public", { recursive: true })
  const _esbuild = require("esbuild")
  console.time("ESBUILD:BUNDLETIME")
  //const {lessLoader} = require("esbuild-plugin-less")
  _esbuild.build({
      define: {
        "process.env.NODE_ENV": '"production"'
      },
      bundle: true,
      //minify: true,
      minify: false,
      loader: {
        ".svg": "file"
      },
      //plugins: [lessLoader()],
      //outdir: "public",
      outfile: "./public/app.js",
      entryPoints: ["src/index.tsx"],
      platform: "browser"
    }).then(() => {
    console.timeEnd("ESBUILD:BUNDLETIME")
    console.log(getFileSize("./public/app.js"))
  })
}

const args = process.argv.slice(2)

args.includes("--bundle") && bundle()
args.includes("--fast") && bundle()

//default
args[0] == null && bundle()
