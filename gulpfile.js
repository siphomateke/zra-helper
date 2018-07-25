const gulp = require('gulp');
const runSequence = require('run-sequence');
const del = require('del');
const sass = require('gulp-sass');
const merge2 = require('merge2');
const concat = require('gulp-concat');
const webpack = require('webpack');
const webpackDevConfig = require('./build/webpack.dev.conf.js');
const webpackProdConfig = require('./build/webpack.prod.conf.js');
const semanticWatch = require('./vendor/semantic/tasks/watch');
const semanticBuild = require('./vendor/semantic/tasks/build');

let config = {
    dir: {
        src: 'src',
        dest: 'dist',
    },
    sass: {
        entries: {
            'dashboard': 'src/scss/dashboard.scss',
        },
        output: 'css',
    },
};

config.copy = [{
    watch: ['**/*.html', '**/*.js'],
    from: config.dir.src+'/**',
    to: '',
    ignore: [
        config.dir.src+'/{scss,scss/**}',
        config.dir.src+'/{js,js/**}',
    ],
}, {
    from: [
        'node_modules/ocrad.js/ocrad.js',
        'node_modules/jquery/dist/jquery.min.js',
    ],
    to: 'vendor',
}, {
    from: 'static/**/*',
    to: '',
}];

gulp.task('clean', function () {
    return del([config.dir.dest+'/**/*', '!'+config.dir.dest+'/vendor/semantic']);
});

gulp.task('copy', function () {
    let tasks = [];
    for (let copy of config.copy) {
        let src = [];
        if (Array.isArray(copy.from)) {
            src = copy.from;
        } else {
            src.push(copy.from);
        }
        if (copy.ignore) {
            for (let ignore of copy.ignore) {
                src.push('!'+ignore);
            }
        }

        let dest = config.dir.dest+'/'+copy.to;
        tasks.push(gulp.src(src)
            .pipe(gulp.dest(dest))
        );
    }
    return merge2(tasks);
});

gulp.task('build:styles', function (done) {
    let tasks = [];
    for (const name of Object.keys(config.sass.entries)) {
        let stream = gulp.src(config.sass.entries[name])
            .pipe(sass({includePaths: ['node_modules/']}).on('error', sass.logError))
            .pipe(concat(name+'.css'))
            .pipe(gulp.dest(config.dir.dest+'/'+config.sass.output));
        tasks.push(stream);
    }
    return merge2(tasks);
});

gulp.task('build:scripts', function (done) {
    let webpackConfig = process.env.NODE_ENV === 'production' ? webpackProdConfig : webpackDevConfig;
    webpack(webpackConfig).run((err, stats) => {
        if (err || stats.hasErrors()) {
            done(err);
        } else {
            console.log(stats.toString({colors: true}));
            done();
        }
    });
});

gulp.task('build:ui', semanticBuild);

gulp.task('watch:styles', function() {
    return gulp.watch(config.dir.src+'/**/*.scss', ['build:styles']);
});

gulp.task('watch:js', function() {
    gulp.watch(config.dir.src+'/**/*.js', gulp.task('build:scripts'));
});

gulp.task('watch:markup', function() {
    for (let copy of config.copy) {
        if (copy.watch) {
            let watch = [];
            for (const pattern of copy.watch) {
                watch.push(config.dir.src+'/'+pattern);
            }
            gulp.watch(watch, ['copy']);
        }
    }
});

gulp.task('watch:ui', semanticWatch);

gulp.task('watch', [
    'watch:styles',
    'watch:markup',
    'watch:js',
    'watch:ui'
]);

gulp.task('build', function (done) {
    runSequence('clean', ['copy', 'build:styles', 'build:scripts', 'build:ui'], done);
});

gulp.task('default', function (done) {
    runSequence('build', 'watch', done);
});
