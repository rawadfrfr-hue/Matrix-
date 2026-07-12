import sys

with open('server.ts', 'r') as f:
    content = f.read()

start_marker = "  // MULTIPART UPLOAD: START\n  app.post('/api/upload/multipart/start', async (req, res) => {"
idx = content.rfind(start_marker)
if idx != -1:
    content = content[:idx] + "  app.post('/api/file/:fileId/thumbnail', async (req, res) => {" + content[content.rfind("  app.post('/api/file/:fileId/thumbnail', async (req, res) => {") + len("  app.post('/api/file/:fileId/thumbnail', async (req, res) => {"):]
    with open('server.ts', 'w') as f:
        f.write(content)
    print('reverted')
else:
    print('not found')

