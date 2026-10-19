// Copies pdf.js's worker into public/ so the web build serves it at
// /pdf.worker.min.mjs (and build-sw.js precaches it for offline imports).
// The file is generated, so it's gitignored.

const fs = require('fs');
const path = require('path');

const src = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = path.join(__dirname, '..', 'public', 'pdf.worker.min.mjs');
fs.copyFileSync(src, dest);
console.log('Copied pdf.js worker to public/');
