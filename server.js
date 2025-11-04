// Simple blog server with file persistence
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');

// uploads dir inside public so static middleware serves files
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer will be required at runtime; ensure dependency installed (npm install multer)
let multer;
try { multer = require('multer'); } catch (err) { console.warn('Multer not installed. File uploads will not work until you `npm install multer`.'); }
let uploadMiddleware = null;
if (multer) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = Date.now() + '-' + Math.random().toString(36).slice(2,8);
      cb(null, base + ext);
    }
  });
  uploadMiddleware = multer({ storage });
}

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Log which public directory we serve (helps debugging)
console.log('Serving static files from', path.join(__dirname, 'public'));

// Explicit root routes in case static middleware isn't resolving index
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/blog.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'blog.html')));

function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]', 'utf8');
  } catch (err) {
    console.error('Failed to ensure data file:', err);
    process.exit(1);
  }
}

ensureDataFile();

let posts = [];
function loadPosts() {
  try {
    const raw = fs.readFileSync(POSTS_FILE, 'utf8');
    posts = JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Failed to load posts:', err);
    posts = [];
  }
}

function savePosts() {
  try { fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf8'); }
  catch (err) { console.error('Failed to save posts:', err); }
}

loadPosts();

app.get('/posts', (req, res) => res.json(posts));

// file upload endpoint (multipart/form-data, field name 'files')
app.post('/upload', (req, res) => {
  if (!uploadMiddleware) return res.status(500).json({ error: 'multer not installed' });
  uploadMiddleware.array('files')(req, res, (err) => {
    if (err) return res.status(500).json({ error: 'upload failed', detail: String(err) });
    const files = (req.files || []).map(f => {
      return { url: `/uploads/${f.filename}`, original: f.originalname, mime: f.mimetype };
    });
    res.json({ files });
  });
});

app.get('/posts/:id', (req, res) => {
  const { id } = req.params;
  const post = posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(post);
});

app.post('/posts', (req, res) => {
  const { title, author, content, media } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and Content are required' });
  const newPost = { id: Date.now().toString(), title, author: author || 'Anonymous', content, media: Array.isArray(media) ? media : [], createdAt: new Date().toISOString() };
  posts.unshift(newPost);
  savePosts();
  res.json(newPost);
});

app.put('/posts/:id', (req, res) => {
  const { id } = req.params;
  const { title, author, content, media } = req.body;
  const idx = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  if (title) posts[idx].title = title;
  if (author) posts[idx].author = author;
  if (content) posts[idx].content = content;
  if (Array.isArray(media)) posts[idx].media = media;
  posts[idx].updatedAt = new Date().toISOString();
  savePosts();
  res.json(posts[idx]);
});

app.delete('/posts/:id', (req, res) => {
  const { id } = req.params;
  const before = posts.length;
  posts = posts.filter(p => p.id !== id);
  if (posts.length === before) return res.status(404).json({ error: 'Post not found' });
  savePosts();
  res.json({ message: 'Post deleted' });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));


