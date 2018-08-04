const fs = require('fs');
const fileName = './static/manifest.json';

function updateExtensionManifest() {
    console.log('Syncing extension manifest.json with package.json');
    let manifest;
    fs.readFile(fileName, 'utf8', function (err, data) {
        if (err) return console.log(err);

        manifest = JSON.parse(data);
        manifest.version = process.env.npm_package_version;

        fs.writeFile(fileName, JSON.stringify(manifest, null, 4), function (err) {
            if (err) return console.log(err);
            console.log('Successfully synced extension manifest');
        });
    });
}

updateExtensionManifest();