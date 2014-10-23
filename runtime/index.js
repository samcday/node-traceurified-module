"use strict";

var fs = require("fs");
var Module = require("module");
var path = require("path");
var vm = require("vm");

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

var initModule = function(traceurifiedRequire, ctxModule, filename) {
  // A lot of this code is jacked from node-core module.js _compile
  var ctxRequire = traceurifiedRequire;

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

  ctxModule.filename = filename;
  ctxModule.paths = Module._nodeModulePaths(path.dirname(filename));
};

var createSandbox = function(ctxRequire, ctxModule, filename) {
  var sandbox = {
    module: ctxModule,
    exports: ctxModule.exports,
    require: ctxRequire,
    __filename: filename,
    __dirname: path.dirname(filename),
    // root: root,
  };

  for (var k in global) {
   sandbox[k] = global[k];
  }

  delete sandbox.global;

  return sandbox;
};

// Ensures the Traceur runtime is initialised in given vm context.
var setupTraceurRuntime = function(originModule, ctx) {
  // var traceurRuntimePath = Module._resolveFilename("traceur/bin/traceur-runtime", originModule);
  var traceurRuntimePath = path.join(traceurifiedDistDir, "traceur-runtime.js");
  vm.runInContext(fs.readFileSync(traceurRuntimePath, "utf8"), ctx, traceurRuntimePath);
};

// Creates a require() function for use in the traceurified-module consumer module.
// The provided require() function will intelligently load the Traceur compiled
// code when necessary, and fallback to regular require() otherwise.
var createTraceurifiedRequire = function(root, manifest, originModule) {
  var traceurifiedRequire = function(id) {
    var moduleFilename = Module._resolveFilename(id, originModule);

    if (moduleFilename.indexOf(root) === 0) {
      for (var i = 0; i < manifest.length; i++) {
        if (moduleFilename === path.join(root, manifest[i])) {
          var newModule = new Module(moduleFilename, originModule);
          Module._cache[moduleFilename] = newModule;

          var newRequire = createTraceurifiedRequire(root, manifest, newModule);
          initModule(newRequire, newModule, moduleFilename);

          var ctx = vm.createContext(createSandbox(newRequire, newModule, moduleFilename));
          setupTraceurRuntime(originModule, ctx);

          // We don't add "global" to the sandbox until after we've set up Traceur runtime.
          // Otherwise, the runtime attaches to main ctx built-ins via global.String / global.Object etc.
          ctx.global = ctx;

          var moduleBaseFilename = path.relative(root, moduleFilename);
          var compiledCode = fs.readFileSync(path.join(root, traceurifiedDistDir, moduleBaseFilename));
          
          vm.runInContext(compiledCode, ctx, moduleFilename);
          return ctx.module.exports;
        }
      }
    }
    return originModule.require(id);
  };

  return traceurifiedRequire;
};

exports.entrypoint = function(originModule, entrypointFile) {
  var root = findPackageRoot(path.dirname(originModule.filename));
  var rootPackage = require(path.join(root, "package.json"));
  var config = rootPackage.traceurified || {};
  var manifest = config.files || [];

  // This doesn't work. traceurified-module will need to do compilation in a
  // sandboxed traceur.
  // var traceurifiedModule;
  // try {
  //   traceurifiedModule = originModule.require("traceurified-module");
  // } catch(e) {}

  // if (traceurifiedModule) {
  //   traceurifiedModule.compile(root);
  // }

  var traceurifiedRequire = createTraceurifiedRequire(root, manifest, originModule);
  originModule.exports = traceurifiedRequire(entrypointFile);
};
