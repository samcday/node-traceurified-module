"use strict";

var vm = require("vm");
var path = require("path");
var fs = require("fs");
var Module = require("module");

var traceurRuntimePath = require.resolve("traceur/bin/traceur-runtime");

var findPackage = function(searchPath) {
  // Start at the given path, work our way up until we find a package.json.
  while(searchPath !== "/") {
    if (fs.existsSync(path.join(searchPath, "package.json"))) {
      return searchPath;
    }
    searchPath = path.resolve(searchPath, "..");
  }

  throw new Error("Couldn't find a package.json from caller. Are you trying to use this from a REPL?");
};

var createSandbox = function(ctxModule) {
  // A lot of this code is jacked from node-core module.js _compile
  var ctxRequire = function require(path) {
    return ctxModule.require(path);
  }

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
    global: sandbox,
    root: root,
  };

  for (var k in global) {
   sandbox[k] = global[k];
  }

  return sandbox;
};

var traceurRuntime = function() {
  var script = fs.readFileSync(traceurRuntimePath, "utf8");
  traceurRuntime = function() {
    return script;
  }
  return script;
};

var hookRequire = function(baseDir, es6Files) {
  var originalRequireFn = Module._extensions[".js"];
  Module._extensions[".js"] = function(newModule, moduleFilename) {
    if (moduleFilename.indexOf(baseDir) === 0) {
      for (var i = 0; i < es6Files.length; i++) {
        if (moduleFilename === path.join(baseDir, es6Files[i])) {
          var ctx = vm.createContext(createSandbox(newModule));
          vm.runInContext(traceurRuntime(), ctx, traceurRuntimePath);
          vm.runInContext(fs.readFileSync(moduleFilename, "utf8"), ctx, moduleFilename);
          return true;
        }
      }
    }

    return originalRequireFn(newModule, moduleFilename);
  };
};

exports.entrypoint = function(_module, entrypointFile) {
  // Determine the base of calling module
  var moduleBase = path.dirname(_module.filename);
  var originRoot = findPackage(moduleBase);

  var originPackage = require(path.join(originPath, "package.json"));
  var config = originPackage.traceurified || {};
  var manifest = config.manifest || [];
  manifest.unshift(path.join(moduleBase, entrypointFile));

  hookRequire(originRoot, manifest);
};

exports.compile = function(root) {

};
