//const babelify = require("babelify")
//var browserify = require("browserify")
const { browserify, babelify } = require("omnify")
const { hmr, tsxify, lessify , sucrasify , createBrowserifyServer} = require("omnify")


var bundler = browserify("src/index.tsx", {
  cache: {},
  packageCache: {},
  debug: true,
  sourceMaps: false,
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  //plugin: [hmr],
  transform: [
    lessify,
    //tsxify,
    sucrasify,
    
    babelify.configure({
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
      plugins: [
        ["@babel/plugin-transform-typescript", { isTSX: true }],
        ["@babel/plugin-proposal-decorators", { legacy: true }],
        ["@babel/plugin-syntax-object-rest-spread"],
        ["@babel/plugin-proposal-class-properties", { loose: true }],
        [
          "@babel/transform-react-jsx",
          {
            useBuiltIns: true,
            runtime: "automatic",
            useSpread: true,
            importSource: "preact",
          },
        ],
        ["@babel/plugin-transform-modules-commonjs"],
        [
          "babel-plugin-module-resolver",
          {
            root: ["./src"],
            extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
          },
        ],
      ],
      sourceMaps: false,
    }),

    // [
    //   aliasify.configure({
    //     aliases: {
    //       "react": "react/cjs/react.production.min.js",
    //       "react-dom": "react-dom/cjs/react-dom.production.min.js"
    //     },
    //     appliesTo: { includeExtensions: [".js", ".jsx", ".tsx", ".ts"] }
    //   }),
    //   { global: true }
    // ]
  ],
})

createBrowserifyServer({
  browserify_instance: bundler,
  static_url: "main.js",
})
