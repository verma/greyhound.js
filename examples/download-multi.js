// download-multi.js
// Download data from a greyhound server as parallel downloads
//


var gh = require("../index");

// split a bounding box to a certain depth
var splitTillDepth = function(bbox, depth) {
    var split = function(b, d) {
        var bxs = b.splitQuad();
        if (depth === d) return bxs;

        return [].concat(split(bxs[0], d + 1),
                         split(bxs[1], d + 1),
                         split(bxs[2], d + 1),
                         split(bxs[3], d + 1));
    };

    return split(bbox, 1);
}

var downloadAll = function(sessionId, tasks, readers, done) {
    // pop as many tasks as we can
    //
    while(true) {
        if (tasks.length === 0 ||
            readers.length === 0)
            break; // We have no tasks or no readers

        // otherwise pop a reader and a task
        var r = readers.pop();
        var t = tasks.pop();

        console.log("    :queue read, left readers:", readers.length);
        r.read(sessionId, {depthEnd: 7, bbox: t}, function(err, data) {
            // queue next read
            readers.push(r);

            console.log(tasks.length, readers.length);

            // check if tasks list is empty and all readers have returned, if so
            // we're done
            if (tasks.length === 0 && readers.length === readers.maxReaders)
                return process.nextTick(done);

            if (err)
                return console.log("Error handling request", err);

            process.nextTick(downloadAll.bind(null, sessionId, tasks, readers, done));
            console.log("        :read complete, points:", data.numPoints, "bytes:", data.numBytes);
        });
    }
};


var doStuff = function(readerCount) {
    // Figure out what we're getting
    //
    var server = process.env["HOST"] || "localhost:8080";
    var pipeline = process.env["PIPELINE"] || "58a6ee2c990ba94db936d56bd42aa703";

    // create a greyhound reader
    //
    //
    var reader = new gh.GreyhoundReader(server);

    // create a few readers
    var dataReaders = [];
    dataReaders.maxReaders = readerCount;

    for (var i = 0 ; i < readerCount ; i ++) {
        dataReaders.push(new gh.GreyhoundReader(reader.getHost() + ":" + reader.getPort()));
    }

    console.log("Creating session:");
    reader.createSession(pipeline, function(err, sessionId) {
        if (err) return console.log("Could not create session:", err);

        console.log("    :Session created!");

        // we're going to read some stats first
        //
        console.log("Stats:");
        reader.getStats(sessionId, function(err, stats) {
            if (err) return console.log("Could not query stats:", err);

            console.log("    :Mins:", stats.mins());
            console.log("    :Maxs:", stats.maxs());

            var boxes = splitTillDepth(stats.bbox(), 3);
            console.log("Downloading total:", boxes.length, "regions with", dataReaders.length, "readers.");

            downloadAll(sessionId, boxes, dataReaders, function() {
                console.log("All tasks completed!");
                reader.destroy(sessionId, function() {
                    reader.close();
                    process.exit(0);
                });
            });
        });
    });
};

process.nextTick(function() {
    var n = process.argv[2];
    doStuff(n ? parseInt(n) : 1);
});
