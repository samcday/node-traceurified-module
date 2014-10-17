var traceurified = require("traceurified-module-runtime");

// Second argument is the path to your actual package entrypoint
// (that is, what your package.json "main" was before you pointed it at bootstrap.js)
traceurified.entrypoint(module, "./index");
