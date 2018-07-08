const gulp = require('gulp');
const del = require('del');
const sass = require('gulp-sass');
const merge2 = require('merge2');
const concat = require('gulp-concat');

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
    ],
}, {
    from: [
        'node_modules/webextension-polyfill/dist/browser-polyfill.min.js',
        'node_modules/jquery/dist/jquery.min.js',
        'node_modules/font-awesome/css/font-awesome.min.css',
    ],
    to: 'vendor',
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

gulp.task('watch:styles', function() {
    gulp.watch(config.dir.src+'/**/*.scss', gulp.task('build:styles'));
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
]));

gulp.task('build', gulp.series('clean', 'copy', 'build:styles'));

gulp.task('default', gulp.series('build', 'watch'));

gulp.task('default', gulp.series('build', 'watch'));
