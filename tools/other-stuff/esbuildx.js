var fs = require("fs")
fs.mkdirSync("public", { recursive: true })
const { build, transformSync } = require("esbuild")



fs.writeFileSync("public/out.js", transformSync(fs.readFileSync("./src/index.tsx").toString()).code)


// build({
//   define: {
//     "process.env.NODE_ENV": '"production"'
//   },
//   bundle: true,
//   minify: true,
//   loader: {
//     ".svg": "file"
//   },
//   //plugins: [lessLoader()],
//   //outdir: "public",
//   outfile: "./public/app.js",
//   entryPoints: ["src/index.tsx"],
//   platform: "browser"
// })
