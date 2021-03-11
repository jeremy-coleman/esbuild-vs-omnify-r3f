//https://github.com/rollup/awesome

var fs = require('fs')
var path = require('path')
var tsc = require('./tools/rollup-plugin-typescript-v2')
//var tsc = require('@rollup/plugin-typescript')
var closure = require("@ampproject/rollup-plugin-closure-compiler");
const { terser } = require("rollup-plugin-terser");

const cjs = require('@rollup/plugin-commonjs')
const resolve = require('@rollup/plugin-node-resolve').default


//var EXTERNALS = fs.readdirSync("node_modules")

module.exports = {
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
  },
  inlineDynamicImports: true,
  input: "src/index.tsx",
  output: [
    {
      file: "public/rolled.js",
      format: 'esm',
      globals: {
        'react': 'React',
        'react-dom': 'ReactDOM',
      },
    }
  ],
  preserveModules: false,
  //external: EXTERNALS,
  plugins: [
    tsc(),
    cjs(),
    resolve(),
    terser(),
    closure()
  ],
  onwarn: function(message) {
    if (/external dependency/.test(message)) {
      return;
    }
    if (message.code === "CIRCULAR_DEPENDENCY") {
      return;
    }
    if (message.code === "INPUT_HOOK_IN_OUTPUT_PLUGIN") {
      return;
    } 
    else console.error(message);
  },
}
