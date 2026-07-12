const fs = require('fs');
let file = fs.readFileSync('server.ts', 'utf8');

const str = `
  // MULTIPART UPLOAD: START
  app.post('/api/upload/multipart/start', async (req, res) => {`;
const idx = file.lastIndexOf(str);
if (idx > -1) {
  file = file.substring(0, idx) + "  app.post('/api/file/:fileId/thumbnail', async (req, res) => {" + file.substring(file.lastIndexOf("app.post('/api/file/:fileId/thumbnail', async (req, res) => {") + "app.post('/api/file/:fileId/thumbnail', async (req, res) => {".length);
  fs.writeFileSync('server.ts', file);
  console.log('reverted');
} else {
  console.log('not found');
}
