#!/usr/bin/env node

var traceurifiedModule = require("..");

console.log(traceurifiedModule.compile(process.cwd()));
