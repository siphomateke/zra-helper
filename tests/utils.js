import fs from 'fs';
import path from 'path';

/**
 * Promise version of `readFile`.
 * @param {string} filename
 * @returns {Promise<string>}
 */
export default function loadFile(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(__dirname, filename), { encoding: 'utf-8' }, (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });
}
