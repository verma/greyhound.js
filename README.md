# greyhound.js

This is a Node.js and browser library for consuming [Greyhound](https://github.com/hobu/greyhound) data.

## Installation

    npm install greyhound.js

## Usage

The library provides two _classes_ named `GreyhoundReader` and `Schema`.

### GreyhoundReader

#### Creating a Session
This is the main class to read data from Greyhound.  You start by creating a session on the Greyhound server and then querying it for data.

```javascript
var GreyhoundReader = require('greyhound.js').GreyhoundReader

var reader = GreyhoundReader("server.com");
reader.createSession("pipeline-id", function(err, sessionId) {
    if (err) return console.log("Error creating pipeline:", err);
    console.log("Created a new session with id:", sessionId);
});
```

#### Reading from a Session
Once you have a session you can start reading data from it, right now the reader supports reading all of the data in one go.

```javascript
reader.read(sessionId, function(err, data) {
    if (err) return console.log("Failed to read:", err);
    console.log("Got", data.length, "total bytes");
});
```

You can additionally specify a schema as well:

```javascript
var Schema = require('greyhound.js').Schema;

reader.read(sessionId, {
    schema: Schema.standard()
}, function(err, data) {
    if (err) return console.log("Failed to read:", err);
    console.log("Got", data.length, "total bytes");
});
```

#### Destroying a session
You should finally destroy the session:

```javascript
reader.destroy(sessionId, function(err) {
    if (err) return console.log("Failed to destroy session:", err);
    console.log("Session was destroyed");
});
```

### Schema

A `Schema` class is provided to construct schemas on the fly.  This class provides two standard schemas accessible through functions: `standard()` and `XYZ()`.  To construct a schema you could use one of these as starting points or build your own.

As an example, a schema definition for just the X value, along with Intensity and Red color channel would look like:

```javascript
Schema.X().Intensity().Red();
```

These fields have default types, but you can always specify your own:

```javascript
Schema.X("floating", 8).Intensity("unsigned", 2).Red("float", 4);
```

## Hacking

Just checkout the code and run

    gulp tdd

This will give you URL which you can visit to see the output of unit-tests.  Additionally,

    npm test

will run the test suite for node.js.


## License

MIT




