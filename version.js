const fs = require('fs');

const fileName = './static/manifest.json';

function updateExtensionManifest() {
  console.log('Syncing extension manifest.json with package.json');
  let manifest;
  fs.readFile(fileName, 'utf8', (err, data) => {
    if (err) return console.log(err);

    manifest = JSON.parse(data);
    manifest.version = process.env.npm_package_version;

    fs.writeFile(fileName, JSON.stringify(manifest, null, 4), (err) => {
      if (err) return console.log(err);
      console.log('Successfully synced extension manifest');
      return true;
    });
    return true;
  });
}

updateExtensionManifest();
