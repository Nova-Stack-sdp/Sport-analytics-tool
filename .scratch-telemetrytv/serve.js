// TEMPORARY: serves the dumped preview documents for the visual check.
const http = require('http');
const fs = require('fs');
const path = require('path');

http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'preview-light.html';
  fs.readFile(path.join(__dirname, name), (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}).listen(4321, () => console.log('preview server on http://localhost:4321'));
