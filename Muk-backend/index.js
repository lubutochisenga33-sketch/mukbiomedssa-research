const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// MONGODB CONNECTION
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mukbiomedssa';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================
// CLOUDINARY CONFIGURATION (for PDF storage)
// ============================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your-cloud-name',
  api_key: process.env.CLOUDINARY_API_KEY || 'your-api-key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your-api-secret'
});

// Configure multer to use Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'muk-pdfs',
    resource_type: 'raw', // Important for PDFs
    allowed_formats: ['pdf'],
  },
});

const upload = multer({ storage: storage });

// ============================================
// MONGODB SCHEMAS
// ============================================

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Article Schema
const articleSchema = new mongoose.Schema({
  title: String,
  category: String,
  description: String,
  authors: String,
  institution: String,
  publicationDate: String,
  pdfName: String,
  pdfUrl: String, // Cloudinary URL
  pdfFile: Boolean,
  createdAt: { type: Date, default: Date.now }
});

const Article = mongoose.model('Article', articleSchema);

// Config Schema
const configSchema = new mongoose.Schema({
  app_title: { type: String, default: 'MUK-BIOMEDSSA' },
  app_subtitle: { type: String, default: 'Research App' },
  welcome_message: { type: String, default: 'Stay Updated with the Latest Biomedical Research Discoveries' },
  primary_color: { type: String, default: '#0D7377' },
  secondary_color: { type: String, default: '#f8fafc' },
  accent_color: { type: String, default: '#16a34a' },
  text_color: { type: String, default: '#1e293b' },
  about_description: String,
  font_family: { type: String, default: 'Plus Jakarta Sans' },
  font_size: { type: Number, default: 16 },
  contact_email: { type: String, default: 'biomedssa@muk.ac.zm' },
  contact_location: { type: String, default: 'Mukuba University, Kitwe' },
  contact_website: String
});

const Config = mongoose.model('Config', configSchema);

// Understanding Materials Schema
const understandingSchema = new mongoose.Schema({
  articleId: String,
  summary: String,
  materials: [{
    name: String,
    url: String,
    size: Number
  }]
});

const Understanding = mongoose.model('Understanding', understandingSchema);

// Push Subscription Schema
const pushSubscriptionSchema = new mongoose.Schema({
  endpoint: String,
  keys: {
    p256dh: String,
    auth: String
  },
  createdAt: { type: Date, default: Date.now }
});

const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

// ============================================
// PUSH NOTIFICATION HELPERS
// ============================================

async function sendPushNotification(title, body, data = {}) {
  const subscriptions = await PushSubscription.find();
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/icon.png',
    badge: '/icon.png',
    data: data
  });

  // Send to all subscribed devices
  subscriptions.forEach(async (subscription) => {
    try {
      // Note: For production, use web-push library
      console.log('Would send notification to:', subscription.endpoint);
      // await webpush.sendNotification(subscription, payload);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  });
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Register
app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please fill in all fields' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const newUser = new User({ name, email, password });
    await newUser.save();

    const userWithoutPassword = { id: newUser._id, name: newUser.name, email: newUser.email };
    res.json({
      user: userWithoutPassword,
      session: 'session_' + Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter email and password' });
  }

  try {
    const user = await User.findOne({ email, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userWithoutPassword = { id: user._id, name: user.name, email: user.email };
    res.json({
      user: userWithoutPassword,
      session: 'session_' + Date.now()
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// ARTICLES ROUTES
// ============================================

// Get all articles
app.get('/articles', async (req, res) => {
  try {
    const articles = await Article.find().sort({ createdAt: -1 });
    res.json(articles);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single article
app.get('/articles/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(article);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create article
app.post('/articles', upload.single('pdf'), async (req, res) => {
  const { title, category, description, authors, institution, publicationDate } = req.body;
  
  try {
    const newArticle = new Article({
      title,
      category,
      description,
      authors,
      institution,
      publicationDate,
      pdfName: req.file ? req.file.originalname : '',
      pdfUrl: req.file ? req.file.path : '', // Cloudinary URL
      pdfFile: !!req.file
    });

    await newArticle.save();
    
    // Send push notification
    await sendPushNotification(
      'New Article Published',
      title,
      { articleId: newArticle._id.toString(), action: 'view_article' }
    );

    res.json(newArticle);
  } catch (error) {
    console.error('Error creating article:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update article
app.put('/articles/:id', upload.single('pdf'), async (req, res) => {
  const { title, category, description, authors, institution, publicationDate } = req.body;
  
  try {
    const updateData = {
      title,
      category,
      description,
      authors,
      institution,
      publicationDate
    };

    if (req.file) {
      updateData.pdfName = req.file.originalname;
      updateData.pdfUrl = req.file.path;
      updateData.pdfFile = true;
    }

    const article = await Article.findByIdAndUpdate(req.params.id, updateData, { new: true });
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(article);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete article
app.delete('/articles/:id', async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// CONFIG ROUTES
// ============================================

// Get config
app.get('/config', async (req, res) => {
  try {
    let config = await Config.findOne();
    if (!config) {
      config = new Config();
      await config.save();
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update config
app.post('/config', async (req, res) => {
  try {
    let config = await Config.findOne();
    if (!config) {
      config = new Config(req.body);
    } else {
      Object.assign(config, req.body);
    }
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// UNDERSTANDING MATERIALS ROUTES
// ============================================

// Get all understanding materials
app.get('/understanding', async (req, res) => {
  try {
    const materials = await Understanding.find();
    const result = {};
    materials.forEach(m => {
      result[m.articleId] = {
        summary: m.summary,
        materials: m.materials
      };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get understanding materials for specific article
app.get('/understanding/:articleId', async (req, res) => {
  try {
    const material = await Understanding.findOne({ articleId: req.params.articleId });
    if (!material) {
      return res.json({ summary: '', materials: [] });
    }
    res.json({ summary: material.summary, materials: material.materials });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Save understanding materials for article
app.post('/understanding/:articleId', upload.array('materials', 10), async (req, res) => {
  const { summary } = req.body;
  
  try {
    const materials = req.files ? req.files.map(file => ({
      name: file.originalname,
      url: file.path,
      size: file.size
    })) : [];

    let understanding = await Understanding.findOne({ articleId: req.params.articleId });
    
    if (understanding) {
      understanding.summary = summary || '';
      understanding.materials = materials;
    } else {
      understanding = new Understanding({
        articleId: req.params.articleId,
        summary: summary || '',
        materials
      });
    }

    await understanding.save();
    res.json({ summary: understanding.summary, materials: understanding.materials });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// PUSH NOTIFICATION ROUTES
// ============================================

// Subscribe to push notifications
app.post('/push/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    
    // Check if already subscribed
    const existing = await PushSubscription.findOne({ endpoint });
    if (existing) {
      return res.json({ message: 'Already subscribed' });
    }

    const subscription = new PushSubscription({ endpoint, keys });
    await subscription.save();
    
    res.json({ message: 'Subscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Unsubscribe from push notifications
app.post('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    await PushSubscription.deleteOne({ endpoint });
    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

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
║    📦 Database: MongoDB (Permanent Storage)              ║
║    ☁️  File Storage: Cloudinary                          ║
║    🔔 Push Notifications: Enabled                        ║
║                                                           ║
║    API Endpoints:                                        ║
║    - GET    /health                                      ║
║    - POST   /auth/login                                  ║
║    - POST   /auth/register                               ║
║    - GET    /articles                                    ║
║    - POST   /articles                                    ║
║    - PUT    /articles/:id                                ║
║    - DELETE /articles/:id                                ║
║    - GET    /config                                      ║
║    - POST   /config                                      ║
║    - GET    /understanding                               ║
║    - POST   /understanding/:articleId                    ║
║    - POST   /push/subscribe                              ║
║    - POST   /push/unsubscribe                            ║
║                                                           ║
║    Press Ctrl+C to stop the server                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
