const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// CLOUDINARY CONFIGURATION
// ============================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for PDFs
const pdfStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'muk-pdfs',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
  },
});

const upload = multer({ storage: pdfStorage });

// ============================================
// IN-MEMORY STORAGE (Simple but works)
// ============================================
let users = [];
let articles = [];
let config = {
  app_title: 'MUK-BIOMEDSSA',
  app_subtitle: 'Research App',
  welcome_message: 'Stay Updated with the Latest Biomedical Research Discoveries',
  primary_color: '#0D7377',
  secondary_color: '#f8fafc',
  accent_color: '#16a34a',
  text_color: '#1e293b',
  about_description: 'To provide biomedical science students with accessible, curated research content',
  font_family: 'Plus Jakarta Sans',
  font_size: 16,
  contact_email: 'biomedssa@muk.ac.zm',
  contact_location: 'Mukuba University, Kitwe',
  contact_website: ''
};
let understanding = {};
let pushSubscriptions = [];

// Load data from Cloudinary on startup (for persistence)
async function loadDataFromCloudinary() {
  try {
    const result = await cloudinary.api.resource('muk-data/database.json', { resource_type: 'raw' });
    const response = await fetch(result.secure_url);
    const data = await response.json();
    
    users = data.users || [];
    articles = data.articles || [];
    config = data.config || config;
    understanding = data.understanding || {};
    
    console.log('✅ Data loaded from Cloudinary');
  } catch (error) {
    console.log('ℹ️ No existing data found, starting fresh');
  }
}

// Save data to Cloudinary
async function saveDataToCloudinary() {
  try {
    const data = JSON.stringify({ users, articles, config, understanding });
    const buffer = Buffer.from(data);
    
    await cloudinary.uploader.upload_stream(
      { 
        resource_type: 'raw',
        public_id: 'muk-data/database.json',
        overwrite: true
      },
      (error, result) => {
        if (error) console.error('Save error:', error);
        else console.log('✅ Data saved to Cloudinary');
      }
    ).end(buffer);
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Auto-save every 30 seconds
setInterval(saveDataToCloudinary, 30000);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    storage: 'Cloudinary',
    articles: articles.length
  });
});

// ============================================
// AUTHENTICATION
// ============================================
app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all fields' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  
  const newUser = {
    id: Date.now(),
    name,
    email,
    password,
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  await saveDataToCloudinary();
  
  const { password: _, ...userWithoutPassword } = newUser;
  res.json({
    user: userWithoutPassword,
    session: 'session_' + Date.now()
  });
});

app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter email and password' });
  }
  
  const user = users.find(u => u.email === email && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  
  const { password: _, ...userWithoutPassword } = user;
  res.json({
    user: userWithoutPassword,
    session: 'session_' + Date.now()
  });
});

// ============================================
// ARTICLES
// ============================================
app.get('/articles', (req, res) => {
  res.json(articles);
});

app.get('/articles/:id', (req, res) => {
  const article = articles.find(a => a.id == req.params.id);
  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }
  res.json(article);
});

app.post('/articles', upload.single('pdf'), async (req, res) => {
  const { title, category, description, authors, institution, publicationDate } = req.body;
  
  const newArticle = {
    id: Date.now(),
    title,
    category,
    description,
    authors,
    institution,
    publicationDate,
    pdfName: req.file ? req.file.originalname : '',
    pdfUrl: req.file ? req.file.path : '',
    pdfFile: !!req.file,
    createdAt: new Date().toISOString()
  };
  
  articles.push(newArticle);
  await saveDataToCloudinary();
  
  res.json(newArticle);
});

app.put('/articles/:id', upload.single('pdf'), async (req, res) => {
  const { title, category, description, authors, institution, publicationDate } = req.body;
  
  const index = articles.findIndex(a => a.id == req.params.id);
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
    ...(req.file && { 
      pdfName: req.file.originalname, 
      pdfUrl: req.file.path,
      pdfFile: true 
    })
  };
  
  await saveDataToCloudinary();
  res.json(articles[index]);
});

app.delete('/articles/:id', async (req, res) => {
  const index = articles.findIndex(a => a.id == req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Article not found' });
  }
  
  articles.splice(index, 1);
  await saveDataToCloudinary();
  
  res.json({ message: 'Article deleted successfully' });
});

// ============================================
// CONFIG
// ============================================
app.get('/config', (req, res) => {
  res.json(config);
});

app.post('/config', async (req, res) => {
  config = { ...config, ...req.body };
  await saveDataToCloudinary();
  res.json(config);
});

// ============================================
// UNDERSTANDING MATERIALS
// ============================================
app.get('/understanding', (req, res) => {
  res.json(understanding);
});

app.get('/understanding/:articleId', (req, res) => {
  res.json(understanding[req.params.articleId] || { summary: '', materials: [] });
});

app.post('/understanding/:articleId', upload.array('materials', 10), async (req, res) => {
  const { summary } = req.body;
  
  const materials = req.files ? req.files.map(file => ({
    name: file.originalname,
    url: file.path,
    size: file.size
  })) : [];
  
  understanding[req.params.articleId] = {
    summary: summary || '',
    materials
  };
  
  await saveDataToCloudinary();
  res.json(understanding[req.params.articleId]);
});

// ============================================
// PUSH NOTIFICATIONS
// ============================================
app.post('/push/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  
  if (!pushSubscriptions.find(s => s.endpoint === endpoint)) {
    pushSubscriptions.push({ endpoint, keys });
  }
  
  res.json({ message: 'Subscribed successfully' });
});

app.post('/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== endpoint);
  res.json({ message: 'Unsubscribed successfully' });
});

// ============================================
// START SERVER
// ============================================
loadDataFromCloudinary().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║    MUK-BIOMEDSSA Backend Server                          ║
║                                                           ║
║    ✅ Server running on port ${PORT}                         ║
║    ☁️  Storage: Cloudinary (Permanent)                   ║
║    🔔 Push Notifications: Enabled                        ║
║    📚 Articles loaded: ${articles.length}                            ║
║                                                           ║
║    Press Ctrl+C to stop the server                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
});
