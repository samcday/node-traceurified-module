"use strict";

var vm = require("vm");
var path = require("path");
var fs = require("fs");
var Module = require("module");
var mkdirp = require("mkdirp");

var traceurifiedDistDir = "traceurified-dist";

var findPackageRoot = function(searchPath) {
  // Start at the given path, work our way up until we find a package.json.
  while(searchPath !== "/") {
    if (fs.existsSync(path.join(searchPath, "package.json"))) {
      return searchPath;
    }
    searchPath = path.resolve(searchPath, "..");
  }

  throw new Error("Couldn't find a package.json from caller. Are you trying to use this from a REPL?");
};

var createSandbox = function(ctxModule, filename) {
  // A lot of this code is jacked from node-core module.js _compile
  var ctxRequire = function require(path) {
    return ctxModule.require(path);
  };

  ctxRequire.resolve = function(request) {
    return Module._resolveFilename(request, ctxModule);
  };

  Object.defineProperty(ctxRequire, 'paths', { get: function() {
    throw new Error('require.paths is removed. Use ' +
                    'node_modules folders, or the NODE_PATH ' +
                    'environment variable instead.');
  }});
  ctxRequire.main = process.mainModule;

  // Enable support to add extra extension types
  ctxRequire.extensions = Module._extensions;
  ctxRequire.registerExtension = function() {
    throw new Error('require.registerExtension() removed. Use ' +
                    'require.extensions instead.');
  };

  ctxRequire.cache = Module._cache;

  var sandbox = {
    module: ctxModule,
    exports: ctxModule.exports,
    require: ctxRequire,
    __filename: filename,
    __dirname: path.dirname(filename),
    root: root,
  };

  for (var k in global) {
   sandbox[k] = global[k];
  }

  delete sandbox.global;

  return sandbox;
};

// Ensures the Traceur runtime is initialised in given vm context.
var setupTraceurRuntime = function(originModule, ctx) {
  var traceurRuntimePath = Module._resolveFilename("traceur/bin/traceur-runtime", originModule);
  vm.runInContext(fs.readFileSync(traceurRuntimePath, "utf8"), ctx, traceurRuntimePath);
};

// var hookRequire = function(baseDir, es6Files) {
//   var originalRequireFn = Module._extensions[".js"];
//   Module._extensions[".js"] = function(newModule, moduleFilename) {
//     if (moduleFilename.indexOf(baseDir) === 0) {
//       for (var i = 0; i < es6Files.length; i++) {
//         if (moduleFilename === path.join(baseDir, es6Files[i])) {
//           var ctx = vm.createContext(createSandbox(newModule, moduleFilename));
//           setupTraceurRuntime(ctx);

//           // We don't add "global" to the sandbox until after we've set up Traceur runtime.
//           // Otherwise, the runtime attaches to main ctx built-ins via global.String / global.Object etc.
//           ctx.global = ctx;

//           var moduleBaseFilename = path.relative(baseDir, moduleFilename);
//           var compiledCode = fs.readFileSync(path.join(baseDir, traceurifiedDistDir, moduleBaseFilename));
//           return vm.runInContext(compiledCode, ctx, moduleFilename);
//         }
//       }
//     }

//     return originalRequireFn(newModule, moduleFilename);
//   };
// };

// Creates a require() function for use in the traceurified-module consumer module.
// The provided require() function will intelligently load the Traceur compiled
// code when necessary, and fallback to regular require() otherwise.
var createTraceurifiedRequire = function(root, manifest, originModule) {
  return function(id) {
    var moduleFilename = Module._resolveFilename(id, originModule);

    if (moduleFilename.indexOf(root) === 0) {
      for (var i = 0; i < manifest.length; i++) {
        if (moduleFilename === path.join(root, manifest[i])) {
          var newModule = new Module(moduleFilename, originModule);
          Module._cache[moduleFilename] = newModule;

          var ctx = vm.createContext(createSandbox(newModule, moduleFilename));
          setupTraceurRuntime(originModule, ctx);

          // We don't add "global" to the sandbox until after we've set up Traceur runtime.
          // Otherwise, the runtime attaches to main ctx built-ins via global.String / global.Object etc.
          ctx.global = ctx;

          var moduleBaseFilename = path.relative(root, moduleFilename);
          var compiledCode = fs.readFileSync(path.join(root, traceurifiedDistDir, moduleBaseFilename));
          return vm.runInContext(compiledCode, ctx, moduleFilename);
        }
      }
    }
  };
};

exports.entrypoint = function(originModule, entrypointFile) {
  var root = findPackageRoot(path.dirname(originModule.filename));
  var rootPackage = require(path.join(root, "package.json"));
  var config = rootPackage.traceurified || {};
  var manifest = config.files || [];

  if (!fs.existsSync(root, traceurifiedDistDir)) {
    // traceurified-dist doesn't exist. We assume this means we're in dev mode.

  }
  // hookRequire(root, manifest);

  var traceurifiedRequire = createTraceurifiedRequire(root, manifest, originModule);
  traceurifiedRequire(entrypointFile);

  // originModule.exports = originModule.require(path.join(root, entrypointFile));
};

exports.compile = function(root) {
  root = findPackageRoot(root);
  var rootPackage = require(path.join(root, "package.json"));
  var config = rootPackage.traceurified || {};
  var manifest = config.files || [];

  // Put the traceur-runtime in dist dir.
  var distRoot = path.join(root, traceurifiedDistDir);
  mkdirp.sync(distRoot);
  var traceurRuntime = fs.readFileSync(require.resolve("traceur/bin/traceur-runtime"), "utf8");
  fs.writeFileSync(path.join(distRoot, "traceur-runtime.js"), traceurRuntime);

  // Compile all the files.
  var traceur = require("traceur");
  manifest.forEach(function(file) {
    var distPath = path.join(distRoot, file);
    mkdirp.sync(path.dirname(distPath));

    var originalFile = path.join(root, file);
    var originalSource = fs.readFileSync(originalFile, "utf8");
    var compiledSource = traceur.compile(originalSource);
    fs.writeFileSync(distPath, compiledSource, "utf8");
  });
};
