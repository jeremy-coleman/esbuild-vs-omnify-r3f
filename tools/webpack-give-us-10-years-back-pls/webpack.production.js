const path = require("path")
const webpack = require("webpack")
const {TsconfigPathsPlugin} = require("tsconfig-paths-webpack-plugin")
//const HtmlWebpackPlugin = require("./tools/html-webpack5-plugin")

const HtmlWebpackPlugin = require("html-webpack-plugin")

const outputPath = path.resolve(__dirname, "public")
const ENTRY_FILE = "./src/index.tsx"
const HTML_TEMPLATE = "./src/index.html"

module.exports = {
  mode: "production",
  stats: "minimal",
  target: "web",
  //devtool: "none",
  entry: ENTRY_FILE,
  output: {
    path: outputPath,
    publicPath: "/",
    filename: "app.js"
  },
  resolve: {
    extensions: [".jsx", ".js", ".json", ".mjs", ".ts", ".tsx"],
    alias: {
      "react": "preact/compat",
      "react-dom": "preact/compat",
      "prop-types":"proptypes",
    },
    plugins: [new TsconfigPathsPlugin()]
  },
  module: {
    rules: [
      {test: /\.css$/, use: ["style-loader", "css-loader"]},
      {
        test: /\.(m|c)?[tj]sx?$/,
        use: {
          loader: '@sucrase/webpack-loader',
          options: {
            transforms: ['jsx', 'typescript']
          }
        }
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env": {NODE_ENV: JSON.stringify(process.env.NODE_ENV || "development")}
    }),
    //new webpack.HotModuleReplacementPlugin(),
    new HtmlWebpackPlugin({template: HTML_TEMPLATE}),
  ]
}


//doesnt do anything
// experiments:{
//   outputModule: true
// },
// output: {
//   module: true,
//   path: outputPath,
//   publicPath: "/",
//   filename: "app.js"
// },