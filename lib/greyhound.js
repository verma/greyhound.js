// greyhound.js
// Functionality to connect with greyhound sources
//

var WebSocket = require('ws');
var Buffer = require('buffer').Buffer;

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
            cb(null, res.session);
        });
    });
};

GreyhoundReader.prototype.read = function(sessionId, options, cb) {
    if(!sessionId || typeof(sessionId) === 'function')
        throw new Error('Invalid session parameter');

    if (typeof(options) === 'function') {
        cb = options;
        options = {};
    }

    var schema = options.schema || Schema.standard();

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

    var ws = new WebSocket(uri);
    ws.binaryType = 'arraybuffer';

    // setup binary state:
    //
    this.binary = null;

    ws.onopen = function() {
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
                    dataBuffer: new Buffer(count),
                    cb: cb
                };
            }
        };

        defer(f.bind(null, null, o.conn));
    };

    ws.onerror = function() {
        o.ws = null;
        for(var k in o.handlers) {
            o.handlers[k](new Error("Connection error"));
        }

        defer(f.bind(null, new Error("Connection error")));
    };

    ws.onclose = function() {
        o.ws = null;
    };

    ws.onmessage = function(evt) {
        if ((evt.data instanceof ArrayBuffer) || Buffer.isBuffer(evt.data)) {
            if(!o.binary) {
                // got binary data but no transmission in progress
                return;
            }

            var a = Buffer.isBuffer(evt.data) ? evt.data : Buffer._augment(new Uint8Array(evt.data));

            a.copy(o.binary.dataBuffer, o.binary.sofar);
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

    this.ws = ws;
};

module.exports = {
    Schema: Schema,
    GreyhoundReader: GreyhoundReader,
};
