// download.js
// Download data from a greyhound server
//


var gh = require("../index");

var doStuff = function() {
    // Figure out what we're getting
    //
    var server = process.env["HOST"] || "localhost:8080";
    var pipeline = process.env["PIPELINE"] || "58a6ee2c990ba94db936d56bd42aa703";

    // create a greyhound reader
    //
    //
    var reader = new gh.GreyhoundReader(server);
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

            // Read the points
            //
            console.log("Reading points:");
            reader.read(sessionId, function(err, data) {
                if (err) return console.log("Failed to read points:", err);

                console.log("    :Read result:", data);

                // now finally destroy the session
                console.log("Destroying session:");
                reader.destroy(sessionId, function(err) {
                    if (err) return console.log("Failed to destroy:", err);

                    console.log("    :Destroyed!");
                    reader.close();
                });
            });
        });
    });
};

process.nextTick(doStuff);
