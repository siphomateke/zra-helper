const gulp = require('gulp');
const del = require('del');
const sass = require('gulp-sass');
const merge2 = require('merge2');
const concat = require('gulp-concat');
const webpack = require('webpack');
const webpackDevConfig = require('./build/webpack.dev.conf.js');
const webpackProdConfig = require('./build/webpack.prod.conf.js');

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
    watch: ['**/*.html'],
    from: config.dir.src+'/**/*.html',
    to: '',
}, {
    from: [
        'node_modules/font-awesome/css/font-awesome.min.css',
        'node_modules/ocrad.js/ocrad.js',
    ],
    to: 'vendor',
}, {
    from: 'node_modules/font-awesome/fonts/**/*',
    to: 'fonts',
}, {
    from: 'static/**/*',
    to: '',
}];

gulp.task('clean', function () {
    return del([config.dir.dest+'/**/*']);
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

gulp.task('build:styles', function () {
    let tasks = [];
    for (const name of Object.keys(config.sass.entries)) {
        let stream = gulp.src(config.sass.entries[name]);
        stream.pipe(sass({includePaths: ['node_modules/']}).on('error', sass.logError))
              .pipe(concat(name+'.css'))
              .pipe(gulp.dest(config.dir.dest+'/'+config.sass.output));
        tasks.push(stream);
    }
    return merge2(tasks);
});

const webpackConfig = process.env.NODE_ENV === 'production' ? webpackProdConfig : webpackDevConfig;
const webpackCompiler = webpack(webpackConfig);
/** @type {webpack.Stats.ToStringOptions} */
const webpackStatsOptions = {
    colors: true,
    assets: true,
    chunks: false,
    entrypoints: false,
    modules: false,
    version: false,
    builtAt: false,
    hash: false,
};

gulp.task('build:scripts', function (done) {
    webpackCompiler.run((err, stats) => {
        if (err || stats.hasErrors()) {
            done(err);
        } else {
            console.log(stats.toString(webpackStatsOptions));
            done();
        }
    });
});

gulp.task('watch:styles', function() {
    gulp.watch(config.dir.src+'/**/*.scss', gulp.task('build:styles'));
});

gulp.task('watch:js', function() {
    webpackCompiler.watch({
        ignored: /node_modules/
    }, (err, stats) => {
        console.log(stats.toString(webpackStatsOptions));
    });
});

gulp.task('watch:markup', function() {
    for (let copy of config.copy) {
        if (copy.watch) {
            let watch = [];
            for (const pattern of copy.watch) {
                watch.push(config.dir.src+'/'+pattern);
            }
            gulp.watch(watch, gulp.task('copy'));
        }
    }
});

gulp.task('watch', gulp.parallel([
    'watch:styles',
    'watch:markup',
    'watch:js',
]));

gulp.task('build', gulp.series('clean', 'copy', 'build:styles', 'build:scripts'));

gulp.task('default', gulp.series('build', 'watch'));
