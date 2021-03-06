
import path from 'path';
import { transformTools } from './transform-tools';

var TRANSFORM_NAME = "aliasify";

function getReplacement(file, aliases, regexps) {
  var fileParts, key, pkg, re;
  if (regexps != null) {
    for (key in regexps) {
      re = new RegExp(key);
      if (re.test(file)) {
        if (regexps[key] === false) {
          return false;
        } else if (typeof regexps[key] === "function") {
          return regexps[key](file, key, re);
        } else {
          return file.replace(re, regexps[key]);
        }
      }
    }
  }
  if (aliases != null) {
    if (file in aliases) {
      return aliases[file];
    } else {
      fileParts = /^([^\/]*)(\/.*)$/.exec(file);
      if ((fileParts != null ? fileParts[1] : void 0) in aliases) {
        pkg = aliases[fileParts != null ? fileParts[1] : void 0];
        if (pkg === false) {
          return false;
        } else if (pkg != null) {
          return pkg + fileParts[2];
        }
      }
    }
  }
  return null;
}

function makeTransform(requireAliases) {
  return transformTools.makeFunctionTransform(
    TRANSFORM_NAME,
    {
      jsFilesOnly: true,
      fromSourceFileDir: true,
      functionNames: requireAliases,
    },
    function (functionParams, opts, done) {
      var aliases,
        arg,
        configDir,
        err,
        error,
        error1,
        file,
        fileDir,
        i,
        len,
        ref,
        regexps,
        remainingArgs,
        replacement,
        result,
        verbose;
      if (!opts.config) {
        return done(new Error("Could not find configuration for aliasify"));
      }
      aliases = opts.config.aliases;
      regexps = opts.config.replacements;
      verbose = opts.config.verbose;
      configDir =
        ((ref = opts.configData) != null ? ref.configDir : void 0) ||
        opts.config.configDir ||
        process.cwd();
      result = null;
      file = functionParams.args[0].value;
      if (file != null && (aliases != null || regexps != null)) {
        replacement = getReplacement(file, aliases, regexps);
        if (replacement === false) {
          result = "{}";
        } else if (replacement != null) {
          if (replacement.relative != null) {
            replacement = replacement.relative;
          } else if (/^\./.test(replacement)) {
            replacement = path.resolve(configDir, replacement);
            fileDir = path.dirname(opts.file);
            replacement = "./" + path.relative(fileDir, replacement);
          }
          if (verbose) {
            console.error(
              "aliasify - " +
                opts.file +
                ": replacing " +
                file +
                " with " +
                replacement +
                " " +
                ("of function " + functionParams.name)
            );
          }
          if (/^[a-zA-Z]:\\/.test(replacement)) {
            replacement = replacement.replace(/\\/gi, "\\\\");
          } else {
            replacement = replacement.replace(/\\/gi, "/");
          }
          result = "'" + replacement + "'";
        }
      }
      if (result != null && result !== "{}") {
        remainingArgs = functionParams.args.slice(1);
        if (remainingArgs.length > 0) {
          for (i = 0, len = remainingArgs.length; i < len; i++) {
            arg = remainingArgs[i];
            if (arg.type === "Literal") {
              result += ", '" + arg.value + "'";
            } else if (arg.type === "ObjectExpression") {
              try {
                result += ", " + JSON.stringify(arg.value);
              } catch (error) {
                err = error;
                result += ", " + JSON.stringify({});
              }
            } else if (arg.type === "ArrayExpression") {
              try {
                result += ", " + JSON.stringify(arg.value);
              } catch (error1) {
                err = error1;
                result += ", " + JSON.stringify([]);
              }
            } else {
              result += ", " + arg.value;
            }
          }
        }
        result = functionParams.name + "(" + result + ")";
      }
      return done(null, result);
    }
  );
}

function _aliasify(file, config) {
  var configData, requireish, wrappedTransform;
  requireish = null;
  if (config && "requireish" in config) {
    requireish = config.requireish;
  } else {
    configData = transformTools.loadTransformConfigSync(TRANSFORM_NAME, file, {
      fromSourceFileDir: true,
    });
    if (configData && configData.config && "requireish" in configData.config) {
      requireish = configData.config.requireish;
    }
  }
  wrappedTransform = makeTransform(requireish || ["require"]);
  return wrappedTransform(file, config);
};

function configure(config) {
  return function (file) {
    return aliasify(file, config);
  };
};


var aliasify = Object.assign(_aliasify, {
  configure
});

export {
  aliasify
};

