# traceurified-module

** NOTE: this project isn't ready for use yet. **

Write Node.js packages in ES6 that can be used in production today.

## Quickstart

Add a dev-dependency on `traceurified-module` to your package.

    npm install traceurified-module --save-dev

Add `.traceurified/` to your .gitignore / .hgignore / whatever SVN does (you're still using SVN?!).

    echo ".traceurified/" >> .gitignore

Make sure you have a `.npmignore` file present.

    touch .npmignore

Create a *bootstrap.js* file and declare it to be your `main` entrypoint in your package.json. Also configure a "prepublish" script to call `traceurified-module-compile`.

**package.json**

    {
        // ...
        "main": "bootstrap.js",
        "scripts": {
          "prepublish": "traceurified-module-compile",
        }
        // ...
    }

**bootstrap.js**

    var traceurified = require("traceurified-module");

    // Second argument is the path to your actual package entrypoint
    // (that is, what your package.json "main" was before you pointed it at bootstrap.js)
    traceurified.entrypoint(module, "index.js");

... Voila! You may now start writing ES6 code in your package.

## Why use traceurified-module

Most of the magic happens in Traceur. Traceur handles parsing ES6 code and transforming it into valid ES5 code, along with polyfilling ES6 standard library support. So, why use this project? What does it actually *do*?

 * Simplifies transpiling your ES6 code into ES5 for distribution.
 * Sandboxes your code so that ES6 polyfills and other traceur-runtime code does not affect other packages / application code running in the Node.js process.
 * Basically, does its best to make writing ES6 code that targets ES5 runtimes as seamless as possible from a development and distribution perspective.
 * Integrates with your project in such a way that removing it and shipping ES6 code is extremely simple (once Node.js itself ships a V8 version that implements all of the ES6 you need).

## How It Works

[Traceur](https://github.com/google/traceur) compiles your ES6 code into ES5. It also provides a runtime to support ES6 constructs and polyfill new ES6 APIs.

Due to the nature of these polyfills, and the fact that built-in prototypes such as `String` / `Array` / etc are modified, it is not safe to use Traceur in Node.js packages in the main context.

For this reason, *traceurified-module* isolates your package into a Node.js sandbox, using the built-in [vm](http://nodejs.org/api/vm.html) module. It is important to be aware of this.

*traceurified-module* does its best to make the sandboxed environment seem like a regular Node.js environment. `require` is available. `process` is available. However, there are some caveats. For example, all of the built-ins, like `String`, `Array`, etc, will be pristine copies from V8, with Traceur's polyfills augmented. 