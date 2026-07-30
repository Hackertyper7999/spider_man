const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
require('dotenv').config();
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3847;
const DATA_DIR = path.join(__dirname, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'site-content.json');
const DATA_FILE = path.join(DATA_DIR, 'inquiries.json');
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');
const WIN_FILE = path.join(DATA_DIR, 'win.json');
const IMAGES_FILE = path.join(DATA_DIR, 'site-images.json');
const DEFAULT_IMAGES_FILE = path.join(DATA_DIR, 'default-images.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '904414794856-c2ile6m9h8s2rl4a4pppics57v3en71s.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.set('trust proxy', true);

const ADMIN_USER = 'Piyush_sadar_99';
const ADMIN_PASS = 'PIYUSH_SADAR_99';
const sessions = new Map();

function loadDefaultImages() {
  for (const p of [DEFAULT_IMAGES_FILE, IMAGES_FILE]) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      /* continue */
    }
  }
  return {
    hero: '/uploads/spiderman/spidey_05.jpg',
    gallery: [
      { id: 'g1', src: '/uploads/spiderman/spidey_05.jpg', caption: 'Spider-Man Classic' }
    ]
  };
}

const DEFAULT_IMAGES = loadDefaultImages();

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

const ticketUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `ticket_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image or PDF ticket files allowed'));
  }
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  if (!fs.existsSync(VISITORS_FILE)) fs.writeFileSync(VISITORS_FILE, '[]', 'utf8');
  if (!fs.existsSync(IMAGES_FILE)) {
    fs.writeFileSync(IMAGES_FILE, JSON.stringify(DEFAULT_IMAGES, null, 2), 'utf8');
  }
}

function readInquiries() {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeInquiries(data) {
  ensureDataFiles();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function readVisitors() {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeVisitors(data) {
  ensureDataFiles();
  fs.writeFileSync(VISITORS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function readWinConfig() {
  try {
    if (!fs.existsSync(WIN_FILE)) return null;
    return JSON.parse(fs.readFileSync(WIN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeWinConfig(data) {
  fs.writeFileSync(WIN_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeName(s) {
  return String(s || '').trim().toLowerCase();
}

function normalizePhone(s) {
  return String(s || '').replace(/\D/g, '');
}

function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase();
}

function isWinMatch(person) {
  const win = readWinConfig();
  if (!win) return false;
  return (
    normalizeName(person.first) === normalizeName(win.first) &&
    normalizeName(person.middle) === normalizeName(win.middle) &&
    normalizeName(person.last) === normalizeName(win.last) &&
    normalizePhone(person.number) === normalizePhone(win.number) &&
    normalizeEmail(person.email) === normalizeEmail(win.email)
  );
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first;
  }
  const ip = req.ip || req.socket?.remoteAddress || '';
  return String(ip).replace(/^::ffff:/, '') || 'unknown';
}

function readImages() {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf8'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_IMAGES));
  }
}

function writeImages(data) {
  ensureDataFiles();
  fs.writeFileSync(IMAGES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('=') || '');
  });
  return out;
}

function requireAuth(_req, _res, next) {
  // Open admin: no login required
  next();
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `admin_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

app.post('/api/login', (req, res) => {
  // Kept for compatibility — always succeeds
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { user: ADMIN_USER, at: Date.now() });
  setSessionCookie(res, token);
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req).admin_session;
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', (_req, res) => {
  res.json({ authenticated: true, user: ADMIN_USER });
});

app.get('/api/auth/google-config', (_req, res) => {
  res.json({
    clientId: GOOGLE_CLIENT_ID,
    enabled: Boolean(GOOGLE_CLIENT_ID)
  });
});

app.post('/api/auth/google', async (req, res) => {
  const credential = String(req.body?.credential || '').trim();
  if (!credential) {
    return res.status(400).json({ error: 'Missing Google credential.' });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload() || {};
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email || payload.email_verified === false) {
      return res.status(401).json({ error: 'Google email not verified.' });
    }

    const given = String(payload.given_name || '').trim();
    const family = String(payload.family_name || '').trim();
    const full = String(payload.name || '').trim();
    // Split given name into first + middle when Google returns multiple words
    const givenParts = given.split(/\s+/).filter(Boolean);
    let first = givenParts[0] || '';
    let middle = givenParts.slice(1).join(' ');
    let last = family;
    if (!first && full) {
      const bits = full.split(/\s+/).filter(Boolean);
      first = bits[0] || '';
      last = bits.length > 1 ? bits[bits.length - 1] : '';
      middle = bits.length > 2 ? bits.slice(1, -1).join(' ') : '';
    }

    res.json({
      success: true,
      profile: {
        first,
        middle,
        last,
        email,
        picture: payload.picture || '',
        googleId: payload.sub || '',
        loginMethod: 'google'
      }
    });
  } catch (err) {
    console.error('Google verify failed:', err.message);
    res.status(401).json({ error: 'Invalid Google sign-in.' });
  }
});

function readContent() {
  try {
    return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  } catch {
    return { site: { brand: 'BRAND NEW DAY', title: 'Spider-Man' }, nav: [], quiz: [] };
  }
}

app.get('/api/content', (_req, res) => {
  res.json(readContent());
});

app.put('/api/content', requireAuth, (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid content payload' });
    }
    const current = readContent();
    const merged = { ...current, ...incoming };
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(merged, null, 2), 'utf8');
    res.json({ success: true, content: merged });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to save content' });
  }
});

app.put('/api/content/:section', requireAuth, (req, res) => {
  try {
    const section = req.params.section;
    const current = readContent();
    if (!(section in current) && !['site', 'nav', 'home', 'buglePage', 'charactersPage', 'suitsPage', 'mapPage', 'gamesPage', 'quiz', 'achievements'].includes(section)) {
      // allow creating section
    }
    current[section] = req.body;
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(current, null, 2), 'utf8');
    res.json({ success: true, content: current });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to save section' });
  }
});

app.get('/api/images', (_req, res) => {
  res.json(normalizeImages(readImages()));
});

app.put('/api/images', requireAuth, (req, res) => {
  const { hero, gallery, timeline, movies, logo, favicon, ogImage, cards, views3d, banners } =
    req.body || {};
  const current = normalizeImages(readImages());

  if (typeof hero === 'string') current.hero = hero.trim();
  if (typeof logo === 'string') current.logo = logo.trim();
  if (typeof favicon === 'string') current.favicon = favicon.trim();
  if (typeof ogImage === 'string') current.ogImage = ogImage.trim();

  if (Array.isArray(gallery)) {
    current.gallery = gallery
      .filter((g) => g && g.src)
      .map((g, i) => ({
        id: g.id || `g${Date.now()}_${i}`,
        src: String(g.src).trim(),
        caption: String(g.caption || 'Spider-Man').trim().slice(0, 80),
        type: String(g.type || 'gallery').trim()
      }));
  }

  if (Array.isArray(timeline)) {
    current.timeline = timeline.map((t, i) => ({
      id: t.id || `tl${Date.now()}_${i}`,
      order: Number(t.order) || i + 1,
      title: String(t.title || 'Spider-Man').trim().slice(0, 80),
      year: String(t.year || '').trim().slice(0, 20),
      actor: String(t.actor || '').trim().slice(0, 60),
      note: String(t.note || '').trim().slice(0, 160),
      src: String(t.src || '').trim(),
      finale: Boolean(t.finale)
    }));
  }

  if (movies && typeof movies === 'object') {
    current.movies = { ...current.movies, ...movies };
  }

  for (const key of ['cards', 'views3d', 'banners']) {
    const arr = req.body?.[key];
    if (Array.isArray(arr)) {
      current[key] = arr
        .filter((g) => g && g.src)
        .map((g, i) => ({
          id: g.id || `${key}_${Date.now()}_${i}`,
          src: String(g.src).trim(),
          caption: String(g.caption || '').trim().slice(0, 80),
          type: String(g.type || key).trim()
        }));
    }
  }

  writeImages(current);
  res.json({ success: true, images: current });
});

app.post('/api/images/upload', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const url = `/uploads/${req.file.filename}`;
    const target = String(req.body.target || 'gallery');
    const caption = String(req.body.caption || 'New Image').trim().slice(0, 80);
    const images = normalizeImages(readImages());

    if (target === 'hero') {
      images.hero = url;
    } else if (target === 'logo' || target === 'favicon' || target === 'ogImage') {
      images[target] = url;
    } else if (target.startsWith('movie:')) {
      const key = target.slice(6);
      if (!images.movies) images.movies = {};
      images.movies[key] = url;
    } else if (target.startsWith('timeline:')) {
      const id = target.slice(9);
      const item = images.timeline.find((t) => t.id === id);
      if (item) item.src = url;
      else return res.status(404).json({ error: 'Timeline item not found' });
    } else if (target.startsWith('gallery:')) {
      const id = target.slice(8);
      const item = images.gallery.find((g) => g.id === id);
      if (item) {
        item.src = url;
        if (caption) item.caption = caption;
      } else {
        return res.status(404).json({ error: 'Gallery item not found' });
      }
    } else if (target === 'cards' || target === 'views3d' || target === 'banners') {
      images[target].unshift({
        id: `${target}_${Date.now()}`,
        src: url,
        caption,
        type: target
      });
    } else if (target.startsWith('cards:') || target.startsWith('views3d:') || target.startsWith('banners:')) {
      const [bucket, id] = target.split(':');
      const item = (images[bucket] || []).find((g) => g.id === id);
      if (item) {
        item.src = url;
        if (caption) item.caption = caption;
      } else return res.status(404).json({ error: 'Media item not found' });
    } else {
      images.gallery.unshift({
        id: `up_${Date.now()}`,
        src: url,
        caption,
        type: 'gallery'
      });
    }

    writeImages(images);
    res.status(201).json({ success: true, url, images });
  });
});

app.delete('/api/images/:id', requireAuth, (req, res) => {
  const images = normalizeImages(readImages());
  const id = req.params.id;

  if (id === 'hero' || id === 'logo' || id === 'favicon' || id === 'ogImage') {
    images[id] = '';
    writeImages(images);
    return res.json({ success: true, images });
  }

  for (const bucket of ['gallery', 'timeline', 'cards', 'views3d', 'banners']) {
    const before = images[bucket].length;
    images[bucket] = images[bucket].filter((g) => g.id !== id);
    if (images[bucket].length !== before) {
      writeImages(images);
      return res.json({ success: true, images });
    }
  }

  if (id.startsWith('movie:') && images.movies) {
    const key = id.slice(6);
    if (key in images.movies) {
      delete images.movies[key];
      writeImages(images);
      return res.json({ success: true, images });
    }
  }

  res.status(404).json({ error: 'Image not found' });
});

function normalizeImages(data) {
  const base = loadDefaultImages();
  const list = (arr, fallback) => (Array.isArray(arr) ? arr : fallback || []);
  return {
    hero: data.hero != null ? data.hero : base.hero || '',
    logo: data.logo != null ? data.logo : '',
    favicon: data.favicon != null ? data.favicon : '',
    ogImage: data.ogImage != null ? data.ogImage : '',
    timeline: list(data.timeline, base.timeline),
    movies: { ...(base.movies || {}), ...(data.movies || {}) },
    gallery: list(data.gallery, base.gallery),
    cards: list(data.cards, []),
    views3d: list(data.views3d, []),
    banners: list(data.banners, [])
  };
}

app.post('/api/inquiries', (req, res) => {
  const { name, place, age, number, email, instagram, quizScore } = req.body || {};

  if (!name || !place || !age || !number || !email || !instagram) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const ageNum = Number(age);
  const scoreNum = Number(quizScore);
  if (!emailOk) return res.status(400).json({ error: 'Invalid email.' });
  if (!Number.isFinite(ageNum) || ageNum < 5 || ageNum > 120) {
    return res.status(400).json({ error: 'Invalid age.' });
  }

  const inquiries = readInquiries();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    name: String(name).trim(),
    place: String(place).trim(),
    age: ageNum,
    number: String(number).trim(),
    email: String(email).trim().toLowerCase(),
    instagram: String(instagram).trim().replace(/^@/, ''),
    quizScore: Number.isFinite(scoreNum) ? Math.max(0, Math.min(15, Math.round(scoreNum))) : 0,
    createdAt: new Date().toISOString()
  };

  inquiries.unshift(entry);
  writeInquiries(inquiries);
  res.status(201).json({ success: true, inquiry: entry });
});

app.get('/api/inquiries', requireAuth, (req, res) => {
  res.json(readInquiries());
});

app.delete('/api/inquiries/:id', requireAuth, (req, res) => {
  const inquiries = readInquiries();
  const next = inquiries.filter((i) => i.id !== req.params.id);
  if (next.length === inquiries.length) {
    return res.status(404).json({ error: 'Not found.' });
  }
  writeInquiries(next);
  res.json({ success: true });
});

app.post('/api/visitors', (req, res) => {
  const { first, middle, last, number, email, loginMethod, googleId } = req.body || {};
  const firstName = String(first || '').trim().slice(0, 40);
  const middleName = String(middle || '').trim().slice(0, 40);
  const lastName = String(last || '').trim().slice(0, 40);
  const phone = String(number || '').trim().slice(0, 20);
  const mail = String(email || '').trim().slice(0, 80);
  const method = String(loginMethod || 'manual').trim().slice(0, 20);
  const gId = String(googleId || '').trim().slice(0, 64);

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First and last name are required.' });
  }
  if (!phone || !mail) {
    return res.status(400).json({ error: 'Number and email are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
  const ip = getClientIp(req);
  const visitors = readVisitors();
  const now = new Date().toISOString();
  const isWinner = isWinMatch({
    first: firstName,
    middle: middleName,
    last: lastName,
    number: phone,
    email: mail
  });
  const win = readWinConfig();
  const existing = visitors.find((v) => v.ip === ip);

  let entry;
  if (existing) {
    existing.first = firstName;
    existing.middle = middleName;
    existing.last = lastName;
    existing.fullName = fullName;
    existing.number = phone;
    existing.email = mail.toLowerCase();
    existing.isWinner = isWinner;
    existing.loginMethod = method;
    if (gId) existing.googleId = gId;
    existing.updatedAt = now;
    entry = existing;
  } else {
    entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      first: firstName,
      middle: middleName,
      last: lastName,
      fullName,
      number: phone,
      email: mail.toLowerCase(),
      isWinner,
      loginMethod: method,
      googleId: gId || undefined,
      ip,
      createdAt: now,
      updatedAt: now
    };
    visitors.unshift(entry);
  }

  writeVisitors(visitors);
  res.status(201).json({
    success: true,
    visitor: entry,
    isWinner,
    maxSpins: isWinner ? Number(win?.maxSpins) || 3 : 1,
    ticketShow: isWinner ? win?.ticketShow || null : null,
    ticketTitle: isWinner ? win?.ticketTitle || null : null,
    ticketFile: isWinner ? win?.ticketFile || null : null
  });
});

app.post('/api/win/verify', (req, res) => {
  const { first, middle, last, number, email } = req.body || {};
  const person = {
    first: String(first || '').trim(),
    middle: String(middle || '').trim(),
    last: String(last || '').trim(),
    number: String(number || '').trim(),
    email: String(email || '').trim()
  };
  const match = isWinMatch(person);
  const win = readWinConfig();
  res.json({
    isWinner: match,
    maxSpins: match ? Number(win?.maxSpins) || 3 : 1,
    ticketShow: match ? win?.ticketShow || '1 August · 4:00 PM' : null,
    ticketTitle: match ? win?.ticketTitle || 'Spider-Man: Brand New Day' : null,
    ticketFile: match ? win?.ticketFile || null : null
  });
});

app.get('/api/win', requireAuth, (_req, res) => {
  res.json(readWinConfig() || {
    first: '',
    middle: '',
    last: '',
    number: '',
    email: '',
    ticketShow: '1 August · 4:00 PM',
    ticketTitle: 'Spider-Man: Brand New Day',
    ticketFile: '',
    maxSpins: 3
  });
});

app.put('/api/win', requireAuth, (req, res) => {
  const body = req.body || {};
  const prev = readWinConfig() || {};
  const entry = {
    first: String(body.first || '').trim(),
    middle: String(body.middle || '').trim(),
    last: String(body.last || '').trim(),
    number: String(body.number || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    ticketShow: String(body.ticketShow || '1 August · 4:00 PM').trim(),
    ticketTitle: String(body.ticketTitle || 'Spider-Man: Brand New Day').trim(),
    maxSpins: Math.max(1, Math.min(10, Number(body.maxSpins) || 3)),
    // Keep existing uploaded file unless explicitly cleared
    ticketFile: body.ticketFile === '' ? '' : String(body.ticketFile || prev.ticketFile || '').trim()
  };
  if (!entry.first || !entry.last || !entry.number || !entry.email) {
    return res.status(400).json({ error: 'First, last, number and email are required.' });
  }
  writeWinConfig(entry);
  res.json({ success: true, win: entry });
});

app.post('/api/win/ticket-upload', requireAuth, (req, res) => {
  ticketUpload.single('ticket')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    if (!req.file) return res.status(400).json({ error: 'No ticket file uploaded' });

    const url = `/uploads/${req.file.filename}`;
    const win = readWinConfig() || {};
    // Remove previous ticket file if it lived in uploads
    if (win.ticketFile && String(win.ticketFile).startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, 'public', win.ticketFile.replace(/^\//, ''));
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch {
        /* ignore */
      }
    }
    win.ticketFile = url;
    writeWinConfig(win);
    res.status(201).json({ success: true, ticketFile: url, win });
  });
});

app.delete('/api/win/ticket-file', requireAuth, (_req, res) => {
  const win = readWinConfig() || {};
  if (win.ticketFile && String(win.ticketFile).startsWith('/uploads/')) {
    const oldPath = path.join(__dirname, 'public', win.ticketFile.replace(/^\//, ''));
    try {
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch {
      /* ignore */
    }
  }
  win.ticketFile = '';
  writeWinConfig(win);
  res.json({ success: true, win });
});

app.get('/api/visitors', requireAuth, (_req, res) => {
  res.json(readVisitors());
});

app.delete('/api/visitors/:id', requireAuth, (req, res) => {
  const visitors = readVisitors();
  const next = visitors.filter((v) => v.id !== req.params.id);
  if (next.length === visitors.length) {
    return res.status(404).json({ error: 'Not found.' });
  }
  writeVisitors(next);
  res.json({ success: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(['/movies', '/movies.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'movies.html'));
});

app.get(['/gallery', '/gallery.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

app.get(['/join', '/join.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

app.get(['/legends', '/legends.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'legends.html'));
});

app.get(['/bugle', '/bugle.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bugle.html'));
});

app.get(['/characters', '/characters.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'characters.html'));
});

app.get(['/suits', '/suits.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'suits.html'));
});

app.get(['/map', '/map.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'map.html'));
});

app.get(['/trailer', '/trailer.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trailer.html'));
});

app.get(['/games', '/games.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'games.html'));
});

app.get(['/big', '/big.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'big.html'));
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'spiderman-brand-new-day',
    time: new Date().toISOString()
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.path.includes('.')) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureDataFiles();

function startServer(preferredPort) {
  const host = process.env.HOST || '0.0.0.0';
  let port = Number(preferredPort) || 3847;
  const maxTries = 20;

  const tryListen = (attempt) => {
    const server = app.listen(port, host, () => {
      const url = `http://localhost:${port}`;
      console.log('');
      console.log('========================================');
      console.log('  Spider-Man: Brand New Day');
      console.log(`  ${url}`);
      console.log(`  Admin: ${url}/admin`);
      console.log('========================================');
      console.log('');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < maxTries) {
        console.warn(`Port ${port} in use — trying ${port + 1}…`);
        port += 1;
        tryListen(attempt + 1);
        return;
      }
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });
  };

  tryListen(0);
}

startServer(PORT);
