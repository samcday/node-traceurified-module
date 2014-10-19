"use strict";

var fs = require("fs");
var mkdirp = require("mkdirp");
var path = require("path");

var traceurifiedDistDir = "traceurified-dist";

exports.compile = function(root) {
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
    var originalFilePath = path.relative(distRoot, originalFile);

    var sourceMapGenerator = new traceur.outputgeneration.SourceMapGenerator({
      file: originalFile,
    });

    var compileOpts = config.options || {};
    compileOpts.sourceMaps = "inline";

    var compiledSource = traceur.compile(originalSource, compileOpts, originalFilePath);
    fs.writeFileSync(distPath, compiledSource, "utf8");
  });
};
