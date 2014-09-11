(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// browser
// The browser module
//

var gh = require('../src/greyhound');

module.exports = {
    GreyhoundReader: gh.GreyhoundReader,
    Schema: gh.Schema
};

},{"../src/greyhound":2}],2:[function(require,module,exports){
// greyhound.js
// Functionality to connect with greyhound sources
//


var Schema = function() {
    var s = [];
    var genFunction = function(name, deftype, defsize) {
        deftype = deftype || "floating";
        defsize = defsize || 4;

        return function(type, size) {
            type = type || deftype;
            size = size || defsize;

            s.push({
                name: name,
                type: type,
                size: size
            });

            return s;
        };
    };

    s.X = genFunction("X");
    s.Y = genFunction("Y");
    s.Z = genFunction("Z");
    s.Intensity = genFunction("Intensity", "unsigned", 2);
    s.Red = genFunction("Red", "unsigned", 2);
    s.Green = genFunction("Green", "unsigned", 2);
    s.Blue = genFunction("Blue", "unsigned", 2);

    return s;
};

Schema.standard = function() {
    return Schema().X().Y().Z().Intensity().
        Red().Green().Blue();
};

Schema.XYZ = function() {
    return Schema().X().Y().Z();
};


var GreyhoundReader = function(host) {
    if (!host)
        throw new Error('Need hostname to initialize reader');

    if (host.match(/^(\S+):\/\//))
        throw new Error('Protocol specified, need bare hostname');

    this.host = host;

    var portParts = this.host.match(/:(\d+)$/);
    if (portParts !== null)
        this.port = parseInt(portParts[1]);
    else
        this.port = 80;

    // make sure port stuff is taken out of the host
    //
    var hostParts = this.host.match(/^(\S+):/);
    if (hostParts)
        this.host = hostParts[1];
};

var defer = function(f) {
    setTimeout(f);
};

GreyhoundReader.prototype.getHost = function() {
    return this.host;
};

GreyhoundReader.prototype.createSession = function(pipelineId, cb) {
    if (!pipelineId || typeof(pipelineId) === 'function')
        throw new Error('Invalid pipeline');

    this._withConn(function(err, conn) {
        if (err) return cb(err);
        conn.cmd({
            command: 'create',
            pipelineId: pipelineId
        }, function(err, res) {
            if (err) return cb(err);
            console.log("Got stuff", err, res);
            cb(null, res.session);
        });
    });
};

GreyhoundReader.prototype.read = function(sessionId, options, cb) {
    if(!sessionId || typeof(sessionId) === 'function')
        throw new Error('Invalid session parameter');

    console.log(typeof(options));
    if (typeof(options) === 'function') {
        cb = options;
        options = {};
    }

    var schema = options.schema || Schema.standard();
    console.log("schema: ", schema);

    var command = {
        command: 'read',
        session: sessionId,
        schema: {
            dimensions: schema
        }
    };

    this._withConn(function(err, conn) {
        if (err) return cb(err);
        conn.cmd(command, function(err, res) {
            if (err) return cb(err);
            conn.readBinary(res.numBytes, function(err, data) {
                if (err) return cb(err);
                cb(null, {
                    numPoints: res.numPoints,
                    numBytes: res.numBytes,
                    data: data
                });
            });
        });
    });
};

GreyhoundReader.prototype.destroy = function(sessionId, cb) {
    if(!sessionId || typeof(sessionId) === 'function')
        throw new Error('Invalid session parameter');

    this._withConn(function(err, conn) {
        if (err) return cb(err);
        conn.cmd({
            command: 'destroy',
            session: sessionId
        }, function(err, res) {
            if (err) return cb(err);
            cb();
        });
    });
};

GreyhoundReader.prototype.getPort = function() {
    return this.port;
};

GreyhoundReader.prototype._withConn = function(f) {
    if (this.conn) {
        return defer(f.bind(null, null, this.conn));
    }

    var o = this;
    var uri = "ws://" + this.getHost() + ":" + this.getPort() + "/";
    console.log("Using URI:", uri);

    var ws = new WebSocket(uri);
    ws.binaryType = 'arraybuffer';

    console.log("Creating websocket");

    // setup binary state:
    //
    this.binary = null;

    ws.onopen = function() {
        console.log("on open");
        o.ws = ws;
        o.handlers = {};
        o.conn = {
            cmd: function(c, cb) {
                if (!c.command)
                    return defer(cb.bind(null, new Error("No command parameter")));

                o.handlers[c.command] = cb;
                o.ws.send(JSON.stringify(c));
            },
            readBinary: function(count, cb) {
                o.binary = {
                    sofar: 0,
                    bytesLeft: count,
                    dataBuffer: new Int8Array(count),
                    cb: cb
                };
            }
        };

        console.log("Opened!");
        defer(f.bind(null, null, o.conn));
    };

    ws.onerror = function() {
        o.ws = null;
        for(var k in o.handlers) {
            o.handlers[k](new Error("Connection error"));
        }

        console.log("Dispatching error function");
        defer(f.bind(null, new Error("Connection error")));
    };

    ws.onclose = function() {
        o.ws = null;
    };

    ws.onmessage = function(evt) {
        if (evt.data instanceof ArrayBuffer) {
            console.log("on binary");
            if(!o.binary) {
                return console.log("Got binary when no binary transmission in progress");
            }

            var a = new Int8Array(evt.data);
            o.binary.dataBuffer.set(a, o.binary.sofar);
            o.binary.sofar += a.length;
            o.binary.bytesLeft -= a.length;

            if (o.binary.bytesLeft <= 0) {
                var d = o.binary.dataBuffer;
                var cb = o.binary.cb;

                o.binary = null;
                defer(cb.bind(null, null, d));
            }
        }
        else {
            console.log("on data message");
            console.log(evt);
            var data = JSON.parse(evt.data);
            var cmd = data.command;
            if (!cmd)
                return;

            var h = o.handlers[cmd];
            if (h) {
                delete o.handlers[cmd];

                if (data.status !== 1)
                    return defer(h.bind(null, new Error(data.reason || "Unknown Error")));

                // the callback notification needs to happen in this function's context,
                // if we defer this function incoming binary data may left unhandled
                //
                h(null, data);
            }
        }
    };

    console.log("Ive setup everything, waiting for notifications now");
    this.ws = ws;
};

module.exports = {
    Schema: Schema,
    GreyhoundReader: GreyhoundReader
};

},{}],3:[function(require,module,exports){
require('./gh-reader-test.js');

},{"./gh-reader-test.js":4}],4:[function(require,module,exports){
var gh = require('../../browser');


describe("Schema", function() {
    it("should be empty by itself", function() {
        expect(gh.Schema()).toEqual([]);
    });

    it("should have correct items in added order", function() {
        var s = gh.Schema().X().Y().Z();
        expect(s.length).toBe(3);
        expect(s[0]).toEqual({name: "X", type:"floating", size: 4});
        expect(s[1]).toEqual({name: "Y", type:"floating", size: 4});
        expect(s[2]).toEqual({name: "Z", type:"floating", size: 4});
    });

    it("should add using the correct type and size", function() {
        var s = gh.Schema().X("unsigned", 2).Red("floating", 8);

        expect(s.length).toBe(2);
        expect(s[0]).toEqual({name: "X", type: "unsigned", size: 2});
        expect(s[1]).toEqual({name: "Red", type: "floating", size: 8});
    });

    it("should have a standard layout with default fields", function() {
        var s = gh.Schema.standard();

        expect(s.length).toBe(7);
        expect(s[0]).toEqual({name: "X", type:"floating", size: 4});
        expect(s[1]).toEqual({name: "Y", type:"floating", size: 4});
        expect(s[2]).toEqual({name: "Z", type:"floating", size: 4});
        expect(s[3]).toEqual({name: "Intensity", type:"unsigned", size: 2});
        expect(s[4]).toEqual({name: "Red", type:"unsigned", size: 2});
        expect(s[5]).toEqual({name: "Green", type:"unsigned", size: 2});
        expect(s[6]).toEqual({name: "Blue", type:"unsigned", size: 2});
    });

    it("should have a XYZ only schema", function() {
        var s = gh.Schema.XYZ();

        expect(s.length).toBe(3);
        expect(s[0]).toEqual({name: "X", type:"floating", size: 4});
        expect(s[1]).toEqual({name: "Y", type:"floating", size: 4});
        expect(s[2]).toEqual({name: "Z", type:"floating", size: 4});
    });
});

describe("GreyhoundReader", function() {
    it("should error if no host is provided", function() {
        var f = function() {
            new gh.GreyhoundReader();
        };

        expect(f).toThrowError('Need hostname to initialize reader');
    });

    it("should correctly store passed hostname", function() {
        var s = new gh.GreyhoundReader("localhost");

        expect(s.getHost()).toBe("localhost");
    });

    it("should not accept hostname if it specified protocol", function() {
        var f1 = function() {
            var s = new gh.GreyhoundReader("ws://localhost");
        };

        var f2 = function() {
            var s = new gh.GreyhoundReader("http://localhost");
        };

        expect(f1).toThrowError("Protocol specified, need bare hostname");
        expect(f2).toThrowError("Protocol specified, need bare hostname");
    });

    it("should correctly decipher port", function() {
        var s = new gh.GreyhoundReader("localhost");
        expect(s.getPort()).toBe(80);

        var s1 = new gh.GreyhoundReader("localhost:9822");
        expect(s1.getPort()).toBe(9822);
    });

    it("should handle host name and port correctly if invalid port is specified", function() {
        var s =  new gh.GreyhoundReader("localhost:hello");

        expect(s.getHost()).toBe("localhost");
        expect(s.getPort()).toBe(80);
    });

    describe(".createSession", function() {
        it("should fail inline when no pipeline is specified", function() {
            var f = function() {
                var s = new gh.GreyhoundReader("localhost");
                s.createSession();
            };

            expect(f).toThrowError('Invalid pipeline');
        });

        it("should come back with an error when the host was invalid", function(done) {
            var s = new gh.GreyhoundReader("localhost.greyhound");
            s.createSession("1234", function(err) {
                expect(err).toBeTruthy();
                done();
            });
        });

        it("should successfully open a valid pipeline", function(done) {
            var s = new gh.GreyhoundReader("localhost:8080");
            s.createSession("58a6ee2c990ba94db936d56bd42aa703", function(err, session) {
                expect(err).toBeFalsy();
                expect(session.length).toBeGreaterThan(0);
                done();
            });
        });
    });

    var withSession = function(cb, final_cb) {
        var s = new gh.GreyhoundReader("localhost:8080");
        s.createSession("58a6ee2c990ba94db936d56bd42aa703", function(err, session) {
            if (err) return cb(err);
            var done = function() {
                s.destroy(session, final_cb);
            };

            cb(null, s, session, done);
        });
    };

    describe(".read", function() {
        it("should throw an exception inline if invalid pipeline is supplied", function() {
            var f = function() {
                var s = new gh.GreyhoundReader("localhost:8080");
                s.read();
            };

            var f1 = function() {
                var s = new gh.GreyhoundReader("localhost:8080");
                s.read(function() {});
            };

            expect(f).toThrowError("Invalid session parameter");
            expect(f1).toThrowError("Invalid session parameter");
        });

        it("should handle invalid pipeline in the callback", function(done) {
            var s = new gh.GreyhoundReader("localhost:8080");
            s.read("invalid-pipeline", function(err) {
                expect(err.message).toBe("Affinity not found");
                done();
            });
        });

        it("should correctly read default state data", function(done) {
            var s = new gh.GreyhoundReader("localhost:8080");
            s.createSession("58a6ee2c990ba94db936d56bd42aa703", function(err, session) {
                expect(err).toBeFalsy();

                s.read(session, function(err, data) {
                    expect(err).toBeFalsy();
                    expect(data.numPoints).toBe(10653);
                    expect(data.numBytes).toBe(20 * data.numPoints);
                    expect(data.data.length).toBeGreaterThan(0);
                    done();
                });
            });
        });

        it("should regard the schema specification", function(done) {
            withSession(function(err, s, sessionId, finish) {
                s.read(sessionId, {
                    schema: gh.Schema.XYZ()
                }, function(err, res) {
                    expect(err).toBeFalsy();
                    expect(res.numPoints * 12).toBe(res.numBytes);
                    expect(res.data.length).toBe(res.numBytes);
                    finish();
                });
            }, done);

        });
    });

    describe(".destroy", function() {
        it("should report error inline if invalid session parameter is passed", function() {
            var s = new gh.GreyhoundReader("localhost:8080")
            var f = function() {
                s.destroy();
            }
            var f1 = function() {
                s.destroy(function(){});
            };

            expect(f).toThrowError("Invalid session parameter");
            expect(f1).toThrowError("Invalid session parameter");
        });

        it("should correctly report an error if the provided session is invalid", function(done) {
            var s = new gh.GreyhoundReader("localhost:8080");
            s.destroy("junk", function(err) {
                expect(err).toBeTruthy();
                done();
            });
        });
    });
});

},{"../../browser":1}]},{},[3])