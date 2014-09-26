var gh = require('../..');
var Buffer = require('buffer').Buffer;


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

describe("Stats", function() {
    it("should error out if no object is specified", function() {
        var f = function() {
            new gh.Stats();
        };

        expect(f).toThrowError("Need root object");
    });

    it("should correctly query values", function() {
        var o = { val1: { description: "", value: "123", type: "double" }};
        var s = new gh.Stats(o);

        var v = s.get("val1");
        expect(v).toBe(123.0);
        expect(typeof(v)).toBe("number");
    });

    it("should return null if the node is not value type", function() {
        var o = { val1: { description: "", value: "123", typee: "double" }};
        var s = new gh.Stats(o);

        var v = s.get("val1");
        expect(v).toBe(null);
    });

    it("should return null if the asked value doesn't exist", function() {
        var o = { val1: { description: "", value: "123", type: "double" }};
        var s = new gh.Stats(o);

        var v = s.get("val");
        expect(v).toBe(null);
    });

    it("should return hierchical values correctly", function() {
        var o = { val1: { val2: { description: "", value: "123", type: "double" }}};
        var s = new gh.Stats(o);

        var v = s.get("val1/val2");
        expect(v).toBe(123.0);
        expect(typeof(v)).toBe("number");
    });

    it("should return null if hierchical values don't exist", function() {
        var o = { val1: { val2: { description: "", value: "123", type: "double" }}};
        var s = new gh.Stats(o);

        var v = s.get("val/val2");
        expect(v).toBe(null);
    });

    it("should null if the requested value is not a value type", function() {
        var o = { val1: { val2: { description: "", value: "123", type: "double" }}};
        var s = new gh.Stats(o);

        var v = s.get("val1");
        expect(v).toBe(null);
    });

    it("should correctly convert string types", function() {
        var o = { val2: { description: "", value: "123", type: "string" }};
        var s = new gh.Stats(o);

        var v = s.get("val2");
        expect(v).toEqual("123");
    });

    it("should correctly convert nonNegativeInteger types", function() {
        var o = { val2: { description: "", value: "123", type: "nonNegativeInteger" }};
        var s = new gh.Stats(o);

        var v = s.get("val2");
        expect(v).toEqual(123);
    });

    it("should correctly convert float types", function() {
        var o = { val2: { description: "", value: "123.23", type: "float" }};
        var s = new gh.Stats(o);

        var v = s.get("val2");
        expect(v).toEqual(123.23);
    });

    it("should correctly convert base64Binary types", function() {
        var o = { val2: { description: "", value: "aGVsbG8=", type: "base64Binary" }};
        var s = new gh.Stats(o);

        var v = s.get("val2");

        expect(Buffer.isBuffer(v)).toBeTruthy();
        expect(v.toString('utf-8')).toEqual("hello");
    });

    it("should correctly convert values requested as an array", function() {
        var o = { val2: { description: "", value: "aGVsbG8=", type: "base64Binary" }};
        var s = new gh.Stats(o);

        var v = s.get(["val2"]);

        expect(v.length).toBe(1);
        expect(v[0].toString('utf-8')).toEqual("hello");
    });

    it("should correctly convert values requested as an array", function() {
        var o = {
            val1: { description: "", value: "111.11", type: "double" },
            val2: { description: "", value: "222.22", type: "double" }
        };

        var s = new gh.Stats(o);
        var v = s.get(["val1", "val2"]);

        expect(v.length).toBe(2);
        expect(v[0]).toEqual(111.11);
        expect(v[1]).toEqual(222.22);
    });

    it("should return nulls in an array if invalid values are requested", function() {
        var o = {
            val1: { description: "", value: "111.11", type: "double" },
            val2: { description: "", value: "222.22", type: "double" }
        };

        var s = new gh.Stats(o);
        var v = s.get(["v1", "v2", "v3/v4/v5", "v3/v3/v3/v4/v5/v6"]);

        expect(v.length).toBe(4);
        v.forEach(function(_v) {
            expect(_v).toBe(null);
        });
    });

    it("should return hierchical values correctly when requested in an array", function() {
        var o = {
            val1: {
                val3: {description: "", value: "111.11", type: "double" }
            },
            val2: { description: "", value: "222.22", type: "double" }
        };

        var s = new gh.Stats(o);
        var v = s.get(["val2", "val1/val3"]);

        expect(v.length).toBe(2);
        expect(v[0]).toEqual(222.22);
        expect(v[1]).toEqual(111.11);
    });

    it("should coerce values when requested as arrays inside arrays", function() {
        var o = {
            val1: {
                val3: {description: "", value: "111.11", type: "double" }
            },
            val2: { description: "", value: "222.22", type: "double" }
        };

        var s = new gh.Stats(o);
        var v = s.get([["val2"], "val1/val3", ["val1/val3"]]);

        expect(v.length).toBe(3);
        expect(v[0].length).toBe(1);
        expect(v[2].length).toBe(1);

        expect(v[0][0]).toEqual(222.22);
        expect(v[1]).toEqual(111.11);
        expect(v[2][0]).toEqual(111.11);
    });

    it("should return an empty array if an empty array was requested", function() {
        var s = new gh.Stats({});
        expect(s.get([])).toEqual([]);
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
                expect(err).toBeTruthy();
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

        it("should return an emitter and raise all lifetime events", function(done) {
            withSession(function(err, s, sessionId, finish) {
                var br = false, rr = false, er = false;
                var e =
                    s.read(sessionId, {
                        schema: gh.Schema.XYZ()
                    }, function(err, res) {
                        expect(err).toBeFalsy();
                        expect(res.numPoints * 12).toBe(res.numBytes);
                        expect(res.data.length).toBe(res.numBytes);

                        expect(br).toBeTruthy();
                        expect(rr).toBeTruthy();
                        expect(er).toBeTruthy();

                        finish();
                    });

                e.on("begin", function(data) {
                    expect(data).toBeTruthy();
                    expect(data.numBytes).toBeGreaterThan(0);
                    expect(data.numPoints).toBeGreaterThan(0);

                    br = true;
                });

                e.on("read", function(data) {
                    rr = true;

                    expect(data.hasOwnProperty('sofar')).toBeTruthy()
                    expect(data.hasOwnProperty('left')).toBeTruthy()
                });

                e.on("end", function() {
                    er = true;
                });
            }, done);
        });
    });

    describe(".getStats", function() {
        it("should correctly get stats of a pipeline", function(done) {
            withSession(function(err, s, sessionId, finish) {
                s.getStats(sessionId, function(err, res) {
                    expect(err).toBeFalsy();
                    expect(res instanceof gh.Stats).toBeTruthy();

                    finish();
                });
            }, done);
        });

        it("should throw an error if no pipeline is specified", function(done) {
            withSession(function(err, s, sessionId, finish) {
                var f = function() {
                    s.getStats(null, function(){});
                };

                expect(f).toThrowError("Invalid session parameter");
                finish();
            }, done);
        });

        it("should coerce values correctly for mins and maxes", function(done) {
            withSession(function(err, s, sessionId, finish) {
                s.getStats(sessionId, function(err, res) {
                    var n = res.mins();
                    var x = res.maxs();

                    expect(n[0]).toBeCloseTo(635589.01, 2);
                    expect(n[1]).toBeCloseTo(848886.45, 2);
                    expect(n[2]).toBeCloseTo(406.59, 2);

                    expect(x[0]).toBeCloseTo(638994.75, 2);
                    expect(x[1]).toBeCloseTo(853535.43, 2);
                    expect(x[2]).toBeCloseTo(593.73, 2);


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
