const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads', 'pdfs');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// File paths for JSON databases
const USERS_FILE = path.join(dataDir, 'users.json');
const ARTICLES_FILE = path.join(dataDir, 'articles.json');
const CONFIG_FILE = path.join(dataDir, 'config.json');
const UNDERSTANDING_FILE = path.join(dataDir, 'understanding.json');

// Initialize JSON files if they don't exist
const initFile = (filePath, defaultData) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

initFile(USERS_FILE, []);
initFile(ARTICLES_FILE, []);
initFile(CONFIG_FILE, {
  app_title: 'MUK-BIOMEDSSA',
  app_subtitle: 'Research App',
  welcome_message: 'Stay Updated with the Latest Biomedical Research Discoveries',
  primary_color: '#0D7377',
  secondary_color: '#f8fafc',
  accent_color: '#16a34a',
  text_color: '#1e293b',
  about_description: 'To provide biomedical science students with accessible, curated research content that bridges the gap between academic literature and practical understanding, fostering the next generation of healthcare researchers and professionals.',
  font_family: 'Plus Jakarta Sans',
  font_size: 16,
  contact_email: 'biomedssa@muk.ac.zm',
  contact_location: 'Mukuba University, Kitwe',
  contact_website: ''
});
initFile(UNDERSTANDING_FILE, {});

// Helper functions to read/write JSON files
const readJSON = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return filePath === USERS_FILE ? [] : 
           filePath === UNDERSTANDING_FILE ? {} : 
           filePath === CONFIG_FILE ? {} : [];
  }
};

const writeJSON = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// ============================================
// HEALTH CHECK - ADDED THIS!
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// ============================================
// AUTHENTICATION ROUTES - WITHOUT /api prefix
// ============================================

// Register
app.post('/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  // Validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all fields' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const users = readJSON(USERS_FILE);

  // Check if user already exists
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  // Create new user
  const newUser = {
    id: users.length + 1,
    name,
    email,
    password, // In production, hash this with bcrypt
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJSON(USERS_FILE, users);

  // Return user without password
  const { password: _, ...userWithoutPassword } = newUser;
  res.json({
    user: userWithoutPassword,
    session: 'session_' + Date.now()
  });
});

// Login
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter email and password' });
  }

  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  res.json({
    user: userWithoutPassword,
    session: 'session_' + Date.now()
  });
});

// Verify session (simple check - in production use JWT)
app.get('/auth/verify', (req, res) => {
  const userId = req.headers['user-id'];
  
  if (!userId) {
    return res.status(401).json({ error: 'No user ID provided' });
  }

  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === parseInt(userId));

  if (!user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const { password: _, ...userWithoutPassword } = user;
  res.json({ user: userWithoutPassword });
});

// ============================================
// ARTICLES ROUTES - WITHOUT /api prefix
// ============================================

// Get all articles
app.get('/articles', (req, res) => {
  const articles = readJSON(ARTICLES_FILE);
  res.json(articles);
});

// Get single article
app.get('/articles/:id', (req, res) => {
  const articles = readJSON(ARTICLES_FILE);
  const article = articles.find(a => a.id === parseInt(req.params.id));
  
  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }
  
  res.json(article);
});

// Create article
app.post('/articles', upload.single('pdf'), (req, res) => {
  const { title, category, description, authors, institution, publicationDate } = req.body;
  
  const articles = readJSON(ARTICLES_FILE);
  
  const newArticle = {
    id: Date.now(),
    title,
    category,
    description,
    authors,
    institution,
    publicationDate,
    pdfName: req.file ? req.file.filename : '',
    pdfFile: !!req.file,
    createdAt: new Date().toISOString()
  };
  
  articles.push(newArticle);
  writeJSON(ARTICLES_FILE, articles);
  
  res.json(newArticle);
});

// Update article
app.put('/articles/:id', upload.single('pdf'), (req, res) => {
  const { title, category, description, authors, institution, publicationDate } = req.body;
  
  const articles = readJSON(ARTICLES_FILE);
  const index = articles.findIndex(a => a.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Article not found' });
  }
  
  articles[index] = {
    ...articles[index],
    title,
    category,
    description,
    authors,
    institution,
    publicationDate,
    ...(req.file && { pdfName: req.file.filename, pdfFile: true })
  };
  
  writeJSON(ARTICLES_FILE, articles);
  res.json(articles[index]);
});

// Delete article
app.delete('/articles/:id', (req, res) => {
  const articles = readJSON(ARTICLES_FILE);
  const index = articles.findIndex(a => a.id === parseInt(req.params.id));
  
  if (index === -1) {
    return res.status(404).json({ error: 'Article not found' });
  }
  
  // Delete PDF file if exists
  if (articles[index].pdfFile && articles[index].pdfName) {
    const pdfPath = path.join(uploadsDir, articles[index].pdfName);
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  }
  
  articles.splice(index, 1);
  writeJSON(ARTICLES_FILE, articles);
  
  res.json({ message: 'Article deleted successfully' });
});

// ============================================
// CONFIG ROUTES - WITHOUT /api prefix
// ============================================

// Get config
app.get('/config', (req, res) => {
  const config = readJSON(CONFIG_FILE);
  res.json(config);
});

// Update config - CHANGED FROM PUT TO POST
app.post('/config', (req, res) => {
  const config = req.body;
  writeJSON(CONFIG_FILE, config);
  res.json(config);
});

// ============================================
// UNDERSTANDING MATERIALS ROUTES - WITHOUT /api prefix
// ============================================

// Get all understanding materials
app.get('/understanding', (req, res) => {
  const understanding = readJSON(UNDERSTANDING_FILE);
  res.json(understanding);
});

// Get understanding materials for specific article
app.get('/understanding/:articleId', (req, res) => {
  const understanding = readJSON(UNDERSTANDING_FILE);
  const articleId = req.params.articleId;
  res.json(understanding[articleId] || { summary: '', materials: [] });
});

// Save understanding materials for article
app.post('/understanding/:articleId', upload.array('materials', 10), (req, res) => {
  const articleId = req.params.articleId;
  const { summary } = req.body;
  
  const understanding = readJSON(UNDERSTANDING_FILE);
  
  const materials = req.files ? req.files.map(file => ({
    name: file.originalname,
    size: file.size,
    filename: file.filename
  })) : [];
  
  understanding[articleId] = {
    summary: summary || '',
    materials
  };
  
  writeJSON(UNDERSTANDING_FILE, understanding);
  res.json(understanding[articleId]);
});

// ============================================
// FILE SERVING
// ============================================

// Serve PDF files
app.use('/uploads/pdfs', express.static(uploadsDir));

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║    MUK-BIOMEDSSA Backend Server                          ║
║                                                           ║
║    ✅ Server running on http://localhost:${PORT}            ║
║                                                           ║
║    API Endpoints:                                        ║
║    - GET    /health                                      ║
║    - POST   /auth/register                               ║
║    - POST   /auth/login                                  ║
║    - GET    /auth/verify                                 ║
║    - GET    /articles                                    ║
║    - POST   /articles                                    ║
║    - PUT    /articles/:id                                ║
║    - DELETE /articles/:id                                ║
║    - GET    /config                                      ║
║    - POST   /config                                      ║
║    - GET    /understanding                               ║
║    - POST   /understanding/:articleId                    ║
║                                                           ║
║    Press Ctrl+C to stop the server                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}); 