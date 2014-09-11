"use strict";

var vm = require("vm");
var path = require("path");
var fs = require("fs");
var Module = require("module");
var mkdirp = require("mkdirp");

var traceurRuntimePath = require.resolve("traceur/bin/traceur-runtime");

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
    root: root,
  };

  for (var k in global) {
   sandbox[k] = global[k];
  }

  delete sandbox.global;

  return sandbox;
};

var traceurRuntimeCode = function() {
  var script = fs.readFileSync(traceurRuntimePath, "utf8");
  traceurRuntimeCode = function() {
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
          var ctx = vm.createContext(createSandbox(newModule, moduleFilename));
          vm.runInContext(traceurRuntimeCode(), ctx, traceurRuntimePath);

          // We don't add "global" to the sandbox until after we've set up Traceur runtime.
          // Otherwise, the runtime attaches to main ctx built-ins via global.String / global.Object etc.
          ctx.global = ctx;

          var moduleBaseFilename = path.relative(baseDir, moduleFilename);
          var compiledCode = fs.readFileSync(path.join(baseDir, ".traceurified", moduleBaseFilename));
          vm.runInContext(compiledCode, ctx, moduleFilename);

          return;
        }
      }
    }

    return originalRequireFn(newModule, moduleFilename);
  };
};

exports.entrypoint = function(originModule, entrypointFile) {
  var root = findPackageRoot(path.dirname(originModule.filename));
  var rootPackage = require(path.join(root, "package.json"));
  var config = rootPackage.traceurified || {};
  var manifest = config.files || [];

  hookRequire(root, manifest);
  originModule.exports = originModule.require(path.join(root, entrypointFile));
};

exports.compile = function(root) {
  root = findPackageRoot(root);
  var rootPackage = require(path.join(root, "package.json"));
  var config = rootPackage.traceurified || {};
  var manifest = config.files || [];

  // Put the traceur-runtime in dist dir.
  var distRoot = path.join(root, ".traceurified");
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
