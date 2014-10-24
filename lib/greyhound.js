/**
 * @fileOverview
 * @name Greyhound Reader
 * @author Uday Verma
 * @description
 * <hr>
 * <p>This project abstracts the communication protocol required to interact with greyhound data sources</p>
 * <p>Start by taking a look at the {@link GreyhoundReader} class.
 * @version 0.3
 */

var WebSocket = require('ws');
var Buffer = require('buffer').Buffer;
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;

/**
 * Represents a schema definition.  Constructing schema definitions using this
 * class is done by calling functions on the root object returned by <code>Schema()</code> call.
 * The channels are pre-configured with default types and sizes, you can easily override them as well.
 *
 *     @example
 *     var s = Schema().X().Y().Red();              // create a schema with X, Y and Red channels
 *     var s = Schema().X().Y("unsigned", 8).Red();   // same as above but override Y's type to unsigned and size to 8 bytes
 *
 * @class Schema
 * @return An array like object which represents the schema definition
 */
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

/**
 * A function that quickly composes a standard schema which includes XYZ, Intensity and RGB
 *
 * @return Schema with the standard representation
 */
Schema.standard = function() {
    return Schema().X().Y().Z().Intensity().
        Red().Green().Blue();
};

/**
 * A function that quickly composes a schema with just XYZ
 *
 * @return Schema with XYZ
 */
Schema.XYZ = function() {
    return Schema().X().Y().Z();
};


/**
 * <p>Represents read-only stats and allows the user to easily query fields and automatic type
 * coercion.  Stats object needs a root object which is usually sent down by the greyhound server. You
 * can construct a Stats object like so:</p>
 *
 * <code>var s = new Stats(obj);</code>
 *
 * <p>From this point on, the Stats object provides a generic interface to query values out of the provided
 * stats obj.  The output type matches what was supplied as an argument (for single values and arrays only), e.g.</p>
 *
 * <pre>
 * <code>
 * s.get("X/minimum");                  // this returns a single value of X's minimum value
 * s.get(["X/minimun", "X/maximum"]) ;  // this returns X's min and max values in an array.
 * </code>
 * </pre>
 *
 * @class
 * @param opj The root object for where the stats
 * @return Stats when initialized with new, returns a Stats object
 */
var Stats = function(obj) {
    var o = this;

    if (!obj)
        throw new Error("Need root object");

    o.obj = obj;

    var cmap = {
        "nonNegativeInteger": parseInt,
        "float": parseFloat,
        "double": parseFloat,
        "string": function(v) { return v; },
        "base64Binary": function(v) {
            return new Buffer(v, 'base64');
        }
    };

    var walkNode = function(root, k) {
        return _.reduce(k.split("/"), function(acc, v) {
            if (!acc) return acc;
            return acc[v];
        }, root);
    };

    // coerce properties, if an array is being asked for, return the value as
    // an array as well, otherwise use one of the cmap functions to coerce the
    // given value
    //
    o._as = function(v) {
        if (_.isArray(v)) {
            return _.reduce(v, function(a, r) {
                return a.concat([o._as(r)]);
            }, []);
        }

        var node = walkNode(o.obj, v);

        var isLeafLike = _.has(node, "value") && _.has(node, "type");
        if (isLeafLike && cmap[node.type])
            return cmap[node.type](node.value);

        return null;
    };
};

/**
 * Gets the values inside the stats object.  Probably not to be used directly unless you
 * know what you're doing, use one of the helper functions to query the values directly
 *
 * @param v The value to query
 * @return Fetched values matching the type of input argument, null if the value was not found.
 */
Stats.prototype.get = function(v) {
    return this._as(v);
};

/**
 * Get mins bounds
 *
 * @return [MinX, MinY, MinZ]
 */
Stats.prototype.mins = function() {
    return this.get([
        "X/minimum",
        "Y/minimum",
        "Z/minimum",
    ]);
};

/**
 * Get max bounds
 *
 * @return [MaxX, MaxY, MaxZ]
 */
Stats.prototype.maxs = function() {
    return this.get([
        "X/maximum",
        "Y/maximum",
        "Z/maximum",
    ]);
};


/**
 * Get the entire bbox
 *
 * @return {BBox}
 */
Stats.prototype.bbox = function() {
    return new BBox(this.mins(), this.maxs());
}

/**
 * A bounding box abstraction class which can be passed to or returned by the reader. This bounding box is not a general
 * purpose bounding box, but is rather geared towards geo data.  It is also, always axis aligned.
 * The ground is in the X,Y plane and Z represents the height, the Z coordinate is never touched when perfoming
 * splitting actions.  Top refers to North, Left to West, Right to East and Bottom to South.
 *
 * @class
 * @return {BBox}
 */
var BBox = function(mins, maxs) {
    // make sure correct number of elements in both mins and maxs
    if (mins.length != 3 ||
        maxs.length != 3)
        throw new Error("Mins and Maxs should have 3 elements each");

    // make sure all maxes are greater than mins
    mins.forEach(function(v, i) {
        if (v >= maxs[i])
            throw new Error("All elements of maxs should be greater than mins");
    })

    this.mins = mins;
    this.maxs = maxs;
};

/**
 * Split the given BBox into 4 equal bounding boxes
 *
 * @return {[BoxTopLeft, BoxTopRight, BoxBottomLeft, BoxBottomRight]}
 */
BBox.prototype.splitQuad = function() {
    var a = this.splitH();
    var b = a[0].splitV();
    var c = a[1].splitV();

    return [b[0], b[1], c[0], c[1]];
}

/**
 * Split the given bounding box into two boxes, split vertically.
 *
 * @return {[BoxLeft, BoxRight]}
 */
BBox.prototype.splitV = function() {
    var n = this.mins;
    var x = this.maxs;

    var xs = n[0] + (x[0] - n[0]) / 2;

    return [
        new BBox(n, [xs, x[1], x[2]]),
        new BBox([xs, n[1], n[2]], x)
    ];
}

/**
 * Split the given bounding box into two boxes, split horizontally.
 *
 * @return {[BoxTop, BoxBottom]}
 */
BBox.prototype.splitH = function() {
    var n = this.mins;
    var x = this.maxs;

    var ys = n[1] + (x[1] - n[1]) / 2;

    return [
        new BBox(n, [x[0], ys, x[2]]),
        new BBox([n[0], ys, n[2]], x)
    ];
};


/**
 * A read queue implementation, which queues up reads and calls the callbacks when a particular item has been read, useful
 * when you want to queue a bunch of reads (since they can only happen sequentially for now).  This class is generally optimized
 * for reading one kind of data, e.g. you can specify the schema at creation time.  You would always get data in the format
 * designated by the schema.
 *
 * @class
 * @param {GreyhoundReader} reader - The greyhound reader to read data out off of.
 * @param {string} sessionId - The session id to read from.
 * @param {Schema} [schema=Schema.standard()] - The schema to read data in.
 * @return {ReadQueue}
 */
var ReadQueue = function(reader, sessionId, schema) {
    if (!reader) throw new Error("Invalid reader");
    if (!sessionId) throw new Error("Invalid session id");

    this.reader = reader;
    this.sessionId = sessionId;
    this.schema = schema || Schema.standard();
    this.readQueue = [];
};

/**
 * Queue a read for the given bounding box
 *
 * @param {Map} options - The options for reading, similar to the read call for reader. You may override schema here.
 * @param {function} cb - The callback function to call when read is complete.
 * @return {undefined}
 */
ReadQueue.prototype.queue = function(options, cb) {
    this.readQueue.push([options, cb]);
    if (!this.readerWorking)
        this._processNextTask();
};

/**
 * Flush the queue, any queued reads will be cleared and any reads in progress
 * will be cancelled
 *
 * @return {undefined}
 */
ReadQueue.prototype.flush = function() {
    var o = this;

    if (o.to) clearTimeout(o.to); o.to = undefined;

    // TODO: Clear any pending reads with the GH server
    //

    this.readQueue.forEach(function(a) {
        a[1](new Error("Reader queue was flushed"));
    });
    this.readQueue = [];
};

ReadQueue.prototype._processNextTask = function() {
    var o = this;
    o.to = undefined;       // clear the timeout which may have called this function

    if (this.readQueue.length === 0) {
        // ran out of tasks to read
        o.readerWorking = false
        return;
    }

    // if we have a task to process make sure we indicate that the reader is working
    o.readerWorking = true;
    var task = o.readQueue.shift();
    var options = task[0], cb = task[1];

    if (!options.schema) options.schema = o.schema;

    o.reader.read(o.sessionId, options, function(err, data) {
        // immediately queue the next read no matter what while unwinding the stack
        //
        o.to = setTimeout(function() { o._processNextTask(); });

        if (err) return cb(err);
        cb(null, data);
    });
};

/**
 * A greyhound data reader implementation.  This class abstracts the details of reading data
 * from greyhound servers.
 *
 * @example
 * var gh = new GrehoundReader("myserver.com");
 * // create a session
 * //
 * gh.createSession("pipelineid", function(err, id) {
 *     // read some stats just for kicks
 *     gh.getStats(id, function(err, stats) {
 *         // print some informations
 *         console.log("Mins:", stats.mins(), "Maxs:", stats.maxs());
 *
 *         // Read EVERYTHING
 *         gh.read(id, function(err, data) {
 *             // Do fun stuff with data
 *             console.log("Read all the data");
 *
 *             // Finally destroy the session
 *             gh.destroy(id, function(err) {
 *                 console.log("Bye");
 *
 *                 // always a good practice to close this stuff
 *                 gh.close();
 *             });
 *         });
 *     });
 * });
 *
 * @class
 * @param {string} host - Should be a bare hostname with no protocol specified, but may specify a port name .e.g myserver.com:8012
 * @return {GreyhoundReader} When initialized with new, returns a new reader instance
 */
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

/**
 * Get the host associated with the reader instance
 *
 * @return {string} - Host configuration the reader was intialized with
 */
GreyhoundReader.prototype.getHost = function() {
    return this.host;
};

/**
 * Create a greyhound session on the configured host.
 *
 * @param {string}  pipelineId - The pipeline id to use to create the session
 * @param {function} cb - The callback function which gets called when the creation process has completed or erred.
 */
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

/**
 * Read all data available in a given session.  The data is delivered as a binary ArrayBuffer/Buffer and needs
 * to be decoded based on the schema that was specified.
 *
 * @param {string} sessionId  - The session id to use to query data, see {@link createSession} on how to create a session.
 * @param {map} [options={ schema: Schema.standard() }] - Read options.
 * @param {function} cb - The callback function which recieves the downloaded data.
 * @return {EventEmitter} The event emitter which emits progress events.
 */
GreyhoundReader.prototype.read = function(sessionId, options, cb) {
    if(!sessionId || typeof(sessionId) === 'function')
        throw new Error('Invalid session parameter');

    var makebb = function(bb) {
        return [
            bb.mins[0], bb.mins[1],
            bb.maxs[0], bb.maxs[1]];
    }

    if (typeof(options) === 'function') {
        cb = options;
        options = {};
    }

    var schema = options.schema || Schema.standard();

    var command = {
        command: 'read',
        session: sessionId,
        schema: schema
    };


    if (options.bbox) command.bbox = makebb(options.bbox);
    if (options.depthBegin) command.depthBegin = options.depthBegin;
    if (options.depthEnd) command.depthEnd = options.depthEnd;

    var e = new EventEmitter();

    this._withConn(function(err, conn) {
        if (err) return cb(err);
        conn.cmd(command, function(err, res) {
            if (err) return cb(err);

            e.emit("begin", res); // notify that we're starting to read
            conn.readBinary(res.numBytes, e, function(err, data) {
                if (err) return cb(err);
                e.emit("end"); // notify that we're done reading

                cb(null, {
                    numPoints: res.numPoints,
                    numBytes: res.numBytes,
                    data: data
                });
            });
        });
    });

    return e;
};

/**
 * Destroy an already created session.
 *
 * @param {string} sessionId - The session to destroy
 * @param {function} cb - The callback function called when the destroy command completes.
 */
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

GreyhoundReader.prototype.getStats = function(sessionId, cb) {
    if (!sessionId || typeof(sessionId) !== 'string')
        throw new Error('Invalid session parameter');

    this._withConn(function(err, conn) {
        if(err) return cb(err);

        conn.cmd({
            command: 'stats',
            session: sessionId
        }, function(err, res) {
            if (err) return cb(err);

            var root = JSON.parse(res.stats);

            var stats = root.stages['filters.stats'].statistic;
            var obj = _.zipObject(
                _.map(stats, function(v) {
                    return v.name.value;
                }), stats);

            cb(null, new Stats(obj));
        });
    });
};

/**
 * Once you're done with your reader, its wise to close it.
 */
GreyhoundReader.prototype.close = function() {
    this.conn = null;
    if (this.ws)
        this.ws.close();
};

/**
 * Gets the configured port
 *
 * @return {integer} The port being used to connect to the greyhound server
 */
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
            readBinary: function(count, e, cb) {
                o.binary = {
                    sofar: 0,
                    bytesLeft: count,
                    dataBuffer: new Buffer(count),
                    cb: cb,
                    emitter: e
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

            var a = Buffer.isBuffer(evt.data) ? evt.data :
                Buffer._augment(new Uint8Array(evt.data));

            a.copy(o.binary.dataBuffer, o.binary.sofar);
            o.binary.sofar += a.length;
            o.binary.bytesLeft -= a.length;

            o.binary.emitter.emit("read", {
                sofar: o.binary.sofar,
                left: o.binary.bytesLeft
            });

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
    Stats: Stats,
    BBox: BBox,
    ReadQueue: ReadQueue,
    GreyhoundReader: GreyhoundReader,
};
