// gulpfile.js
// gulpfile for greyhound.js build management
//

var gulp = require('gulp');

var jshint = require('gulp-jshint');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var browserify = require('gulp-browserify');
var gutil = require('gulp-util');
var watch = require('gulp-watch');
var livereload = require('gulp-livereload');
var clean = require('gulp-clean');
var connect = require('gulp-connect');

var http = require('http');
var open = require('open');
var path = require('path');

var execFile = require('child_process').execFile;
var fs = require('fs');


gulp.task('tdd', ['serve-specs', 'watch']);


//clean build directory
gulp.task('clean', function(){
    return gulp.src(paths.client.build, {read: false} )
        .pipe(clean());
});

// lint all of our js source files
gulp.task('lint', function (){
    return gulp.src(['lib/**/*.js', 'index.js'])
    .pipe(jshint({
        "smarttabs": true
    }))
    .pipe(jshint.reporter('default'));
});

gulp.task('serve-specs', ['build-specs'], function() {
    connect.server({
        root: 'test',
        livereload: true,
        port: 8000
    });
});

gulp.task('push-reload', function() {
    gulp.src(['test/**/*'])
        .pipe(connect.reload());
});

gulp.task('build-and-reload', ['lint', 'build-specs', 'push-reload']);

gulp.task('watch', ['build-specs'], function() {
    // watch all our dirs and reload if any build stuff changes
    //
    gulp.watch(['lib/**/*.js', 'browser/**/*.js', 'index.js', 'test/spec/**/*.js'], ['build-and-reload']);
});

// build client side js app
gulp.task('build-specs', function(){
    return gulp.src('test/spec/specs.js')
    .pipe(browserify())
    .on("error", gutil.log)
    .on("error", gutil.beep)
    .pipe(gulp.dest("test/build"));
});

gulp.task('clean', function() {
    return gulp.src(paths.build, { read: false })
    .pipe(clean());
});

gulp.task('dist-browserify', function(cb) {
    return gulp.src('index.js')
        .pipe(browserify())
        .on("error", gutil.log)
        .on("error", gutil.beep)
        .pipe(gulp.dest("dist"));
});

gulp.task('optimize', ['dist-browserify'], function(cb) {
    var input = 'dist/index.js';
    var output = 'dist/greyhound.min.js';

    execFile('java', [
        '-jar', 'vendor/closure-compiler/compiler.jar',
        '--js', input,
        '--language_in', 'ECMASCRIPT5',
        '--compilation_level', 'SIMPLE_OPTIMIZATIONS',
        '--js_output_file', output],
        {maxBuffer: (1000*4096)},
        function(err, stdout, stderr) {
            if (err)
                return cb(err);

            fs.unlinkSync(input);
            cb();
        });
});

gulp.task('dist', ['optimize']);

// gulp.task('prod-build', ['build', 'optimize']);
