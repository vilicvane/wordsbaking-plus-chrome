var Path = require('path');
var FS = require('fs');

var Gulp = require('gulp');
var SemVer = require('semver');
var Archiver = require('archiver');

var manifestFilePath = 'manifest.json';
var zipPackageName = 'chrome-package.zip';

var filesToPackGlobs = [
    'icons/**',
    '_locales/**',
    'src/**',
    'lib/**',
    'styles/**',
    '*.html',
    manifestFilePath
];

Gulp.task('bump', function () {
    var versionRegex = /("version"\s*:\s*)"([^"]+)"/;

    var manifestJson = FS.readFileSync(manifestFilePath, 'utf-8');

    manifestJson = manifestJson.replace(versionRegex, function (text, prefix, version) {
        return prefix + '"' + SemVer.inc(version, 'patch') + '"';
    });

    FS.writeFileSync(manifestFilePath, manifestJson);
});

Gulp.task('pack', function () {
    var archive = Archiver.create('zip', {});

    filesToPackGlobs.forEach(function (glob) {
        archive.glob(glob);
    });

    archive.finalize();

    return archive.pipe(FS.createWriteStream(zipPackageName));
});
