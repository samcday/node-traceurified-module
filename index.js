"use strict";

var vm = require("vm");
var path = require("path");
var fs = require("fs");

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

var getSandboxedTraceur = function() {
  var sandbox = vm.createContext({
    require: require,

  }
};

var hookRequire = function(baseDir, es6Files) {
  var originalRequireFn = require("module")._extensions[".js"];
  require("module")._extensions[".js"] = function(module, filename) {
    if (filename.indexOf(baseDir) === 0) {
      for (var i = 0; i < es6Files.length; i++) {
        if (filename === path.join(baseDir, es6Files[i])) {

        }
      }
    }

    return originalRequireFn(module, filename);
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
