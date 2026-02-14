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

console.log('Cloudinary configured:', process.env.CLOUDINARY_CLOUD_NAME ? 'YES' : 'NO');

// Configure multer for PDFs
const pdfStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'muk-pdfs',
    resource_type: 'raw',
    allowed_formats: ['pdf'],
    public_id: (req, file) => {
      // Keep original filename with .pdf extension
      const name = file.originalname.replace(/\.[^/.]+$/, ''); // Remove extension
      return `${Date.now()}-${name}`;
    },
    format: 'pdf' // Explicitly set format as PDF
  },
});

const upload = multer({ storage: pdfStorage });

// ============================================
// IN-MEMORY STORAGE
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

// ============================================
// DATA PERSISTENCE TO CLOUDINARY
// ============================================

// Load data from Cloudinary on startup
async function loadDataFromCloudinary() {
  try {
    console.log('Loading data from Cloudinary...');
    const result = await cloudinary.api.resource('muk-data/database', { resource_type: 'raw' });
    
    const https = require('https');
    const dataString = await new Promise((resolve, reject) => {
      https.get(result.secure_url, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      }).on('error', reject);
    });
    
    const data = JSON.parse(dataString);
    
    users = data.users || [];
    articles = data.articles || [];
    config = data.config || config;
    understanding = data.understanding || {};
    
    console.log(`✅ Data loaded: ${articles.length} articles, ${users.length} users`);
  } catch (error) {
    console.log('ℹ️ No existing data found, starting fresh');
  }
}

// Save data to Cloudinary
async function saveDataToCloudinary() {
  try {
    const data = {
      users,
      articles,
      config,
      understanding,
      lastUpdated: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    
    // Upload as a raw file to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: 'muk-data/database',
          overwrite: true,
          invalidate: true
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(Buffer.from(jsonString));
    });
    
    console.log('✅ Data saved to Cloudinary at', new Date().toLocaleTimeString());
    return true;
  } catch (error) {
    console.error('❌ Error saving data:', error.message);
    return false;
  }
}

// Auto-save every 10 seconds
setInterval(() => {
  saveDataToCloudinary();
}, 10000);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    storage: 'Cloudinary',
    cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'missing',
    articles: articles.length,
    users: users.length
  });
});

// ============================================
// AUTHENTICATION
// ============================================
app.post('/auth/register', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.post('/auth/login', (req, res) => {
  try {
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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

// Get all users (without passwords)
app.get('/users', (req, res) => {
  try {
    const safeUsers = users.map(u => {
      const { password, ...userWithoutPassword } = u;
      return userWithoutPassword;
    });
    res.json(safeUsers);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Delete user
app.delete('/users/:id', async (req, res) => {
  try {
    const index = users.findIndex(u => u.id == req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const deletedUser = users[index];
    users.splice(index, 1);
    await saveDataToCloudinary();
    
    console.log('✅ User deleted:', deletedUser.email);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
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
  try {
    console.log('Creating article...');
    console.log('File uploaded:', req.file ? 'YES' : 'NO');
    
    const { title, category, description, authors, institution, publicationDate } = req.body;
    
    if (!title || !category) {
      return res.status(400).json({ error: 'Title and category are required' });
    }
    
    const newArticle = {
      id: Date.now(),
      title,
      category,
      description,
      authors,
      institution,
      publicationDate,
      pdfName: req.file ? req.file.originalname : '',
      pdfUrl: req.file ? req.file.url || req.file.path : '',
      pdfFile: !!req.file,
      createdAt: new Date().toISOString()
    };
    
    articles.push(newArticle);
    console.log('Article added, total articles:', articles.length);
    
    await saveDataToCloudinary();
    
    console.log('✅ Article created successfully');
    res.json(newArticle);
  } catch (error) {
    console.error('❌ Error creating article:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.put('/articles/:id', upload.single('pdf'), async (req, res) => {
  try {
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
        pdfUrl: req.file.url || req.file.path,
        pdfFile: true 
      })
    };
    
    await saveDataToCloudinary();
    res.json(articles[index]);
  } catch (error) {
    console.error('Error updating article:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.delete('/articles/:id', async (req, res) => {
  try {
    const index = articles.findIndex(a => a.id == req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    articles.splice(index, 1);
    await saveDataToCloudinary();
    
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Error deleting article:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================================
// CONFIG
// ============================================
app.get('/config', (req, res) => {
  res.json(config);
});

app.post('/config', async (req, res) => {
  try {
    config = { ...config, ...req.body };
    await saveDataToCloudinary();
    console.log('✅ Config saved');
    res.json(config);
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
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
  try {
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
  } catch (error) {
    console.error('Error saving understanding materials:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================================
// PUSH NOTIFICATIONS
// ============================================
app.post('/push/subscribe', (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    
    if (!pushSubscriptions.find(s => s.endpoint === endpoint)) {
      pushSubscriptions.push({ endpoint, keys });
    }
    
    res.json({ message: 'Subscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.post('/push/unsubscribe', (req, res) => {
  try {
    const { endpoint } = req.body;
    pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== endpoint);
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
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
║    ☁️  Storage: Cloudinary                               ║
║    💾 Auto-save: Every 10 seconds                        ║
║    📚 Articles: ${articles.length}                                    ║
║    👥 Users: ${users.length}                                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
});

// Save data before shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down, saving data...');
  await saveDataToCloudinary();
  process.exit(0);
});
