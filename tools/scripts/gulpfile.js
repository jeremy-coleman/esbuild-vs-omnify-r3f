var fs = require("fs")
var gulp = require("gulp");

//lets you define tasks out of order
var FwdRef = require("undertaker-forward-reference");
gulp.registry(FwdRef());


var rollup = require("./tools/gulp-rollup");
var closure = require("@ampproject/rollup-plugin-closure-compiler");
const { terser } = require("rollup-plugin-terser");


var gulp_typescript = require("gulp-typescript");

var typescript = gulp_typescript.createProject("tsconfig.json", {
  module: "esnext",
  target: "esnext",
  importHelpers: true,
  removeComments: true,
  allowJs: true,
  jsx: "react",
  jsxFactory: "h",
  experimentalDecorators: true,
  noResolve: true,
  isolatedModules: true,
  skipLibCheck: true,
});

const EXTERNALS = fs.readdirSync("node_modules")

gulp.task("rollit", function () {
    return gulp
      .src(["./src/**/*{.js,.jsx,.ts,.tsx}"])
      .pipe(typescript())
      .pipe(
        rollup({
          //use .js extension because tsc already transformed it to javascript
          input: "src/index.js",
          output: {
            format: "esm",
          },
          external: EXTERNALS,
          treeshake: {
            moduleSideEffects: false,
          },
          inlineDynamicImports: true,
          plugins: [
            terser(),
            closure()
          ],
          onwarn: function (message) {
            if (/external dependency/.test(message)) {
              return;
            }
            if (message.code === "CIRCULAR_DEPENDENCY") {
              return;
            }
            if (message.code === "INPUT_HOOK_IN_OUTPUT_PLUGIN") {
              return;
            } else console.error(message);
          },
        })
      )
      .pipe(gulp.dest("public"));
  });