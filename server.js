require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const http = require('http');
const socketIo = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

console.log('--- START SERWERA ---');
console.log('⏳ Próba nawiązania połączenia z chmurą MongoDB Atlas...');

const bot = process.env.TELEGRAM_BOT_TOKEN 
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
  : null;

mongoose.set('strictQuery', false);

const LEAGUES = [
  { id: 0, name: 'BRONZE', minCoins: 0, maxCoins: 1000, color: '#CD7F32' },
  { id: 1, name: 'SILVER', minCoins: 1000, maxCoins: 5000, color: '#C0C0C0' },
  { id: 2, name: 'GOLD', minCoins: 5000, maxCoins: 10000, color: '#FFD700' },
  { id: 3, name: 'DIAMOND', minCoins: 10000, maxCoins: 15000, color: '#B9F2FF' },
  { id: 4, name: 'MYTHIC', minCoins: 15000, maxCoins: 30000, color: '#FF00FF' },
  { id: 5, name: 'LEGEND', minCoins: 30000, maxCoins: 80000, color: '#FF6347' },
  { id: 6, name: 'GOD', minCoins: 80000, maxCoins: Infinity, color: '#FFD700' }
];

const SKINS = [
  { id: 'default', name: 'Classic Coin', icon: '💰', price: 0, type: 'default' },
  { id: 'diamond', name: 'Diamond', icon: '💎', price: 50, type: 'stars' },
  { id: 'fire', name: 'Fire Coin', icon: '🔥', price: 100, type: 'stars' },
  { id: 'rainbow', name: 'Rainbow', icon: '🌈', price: 150, type: 'stars' },
  { id: 'star', name: 'Star Coin', icon: '⭐', price: 0, type: 'referral', requiredReferrals: 5 },
  { id: 'crown', name: 'Crown Coin', icon: '👑', price: 0, type: 'referral', requiredReferrals: 10 }
];

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  coins: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalTaps: { type: Number, default: 0 },
  energy: { type: Number, default: 1000 },
  maxEnergy: { type: Number, default: 1000 },
  tapPower: { type: Number, default: 1 },
  lastEnergyUpdate: { type: Date, default: Date.now },
  league: { type: Number, default: 0 },
  activeSkin: { type: String, default: 'default' },
  unlockedSkins: [{ type: String, default: ['default'] }],
  boosters: {
  twix: { active: { type: Boolean, default: false }, expiresAt: Date, level: { type: Number, default: 0 } },
  energy2x: { active: { type: Boolean, default: false }, expiresAt: Date, level: { type: Number, default: 0 } },
  autoclicker: { active: { type: Boolean, default: false }, expiresAt: Date, lastTap: Date },
  stamina: { active: { type: Boolean, default: false }, expiresAt: Date, originalMaxEnergy: Number }
},
  completedTasks: [String],
  referredBy: Number,
  referralCount: { type: Number, default: 0 },
  activeReferralCount: { type: Number, default: 0 },
  referralEarnings: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  banned: { type: Boolean, default: false },
  banReason: String,
  suspicious: { type: Boolean, default: false },
  tapIntervals: [Number],
  avgTapInterval: Number,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const taskSchema = new mongoose.Schema({
  taskId: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  title: String,
  description: String,
  reward: { type: Number, default: 500 },
  url: String,
  icon: String,
  enabled: { type: Boolean, default: true }
});

const Task = mongoose.model('Task', taskSchema);

const promoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  reward: { type: Number, default: 1000 },
  usedBy: [Number],
  maxUses: { type: Number, default: 1000 },
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const PromoCode = mongoose.model('PromoCode', promoCodeSchema);

const globalStatsSchema = new mongoose.Schema({
  totalCoins: { type: Number, default: 0 },
  totalTaps: { type: Number, default: 0 },
  totalUsers: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

const GlobalStats = mongoose.model('GlobalStats', globalStatsSchema);

const boosterPriceSchema = new mongoose.Schema({
  boosterId: { type: String, required: true, unique: true },
  basePrice: { type: Number, required: true },
  lastUpdated: { type: Date, default: Date.now }
});

const BoosterPrice = mongoose.model('BoosterPrice', boosterPriceSchema);

const adViewSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  reward: { type: Number, default: 100 },
  viewedAt: { type: Date, default: Date.now }
});

const AdView = mongoose.model('AdView', adViewSchema);

function verifyTelegramWebAppData(initData) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();
    
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return hash === calculatedHash;
  } catch (error) {
    return false;
  }
}

async function authMiddleware(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'];
    
    // TRYB DEWELOPERSKI
    if (!initData || initData === 'undefined' || initData === 'dev_mode' || initData === '') {
      console.log('⚠️  DEV MODE: Skipping auth for', req.path);
      req.telegramUser = { 
        id: 123456789,
        username: 'TestUser',
        first_name: 'Test',
        last_name: 'User'
      };
      return next();
    }
    
    // Produkcja
    if (!verifyTelegramWebAppData(initData)) {
      return res.status(401).json({ error: 'Invalid init data' });
    }
    
    const urlParams = new URLSearchParams(initData);
    const userJson = urlParams.get('user');
    const userData = JSON.parse(userJson);
    
    const user = await User.findOne({ telegramId: userData.id });
    if (user && user.banned) {
      return res.status(403).json({ error: 'User is banned', reason: user.banReason });
    }
    
    req.telegramUser = userData;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

async function adminMiddleware(req, res, next) {
  const isDev = !req.headers['x-telegram-init-data'] || req.headers['x-telegram-init-data'] === 'undefined'
  
  if (isDev) {
    console.log('⚠️  DEV MODE: Admin check bypassed')
    return next()
  }
  
  if (req.telegramUser.id !== parseInt(process.env.ADMIN_TELEGRAM_ID)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function updateEnergy(user) {
  const now = Date.now();
  const timePassed = (now - user.lastEnergyUpdate.getTime()) / 1000;
  const energyToAdd = Math.floor(timePassed);
  
  user.energy = Math.min(user.maxEnergy, user.energy + energyToAdd);
  user.lastEnergyUpdate = new Date(user.lastEnergyUpdate.getTime() + (energyToAdd * 1000));
  
  return user;
}

function getLeague(coins) {
  for (let i = LEAGUES.length - 1; i >= 0; i--) {
    if (coins >= LEAGUES[i].minCoins) {
      return LEAGUES[i];
    }
  }
  return LEAGUES[0];
}

function getLeagueProgress(coins) {
  const league = getLeague(coins);
  
  if (league.id === 6) {
    return { current: league, next: null, progress: 100 };
  }
  
  const nextLeague = LEAGUES[league.id + 1];
  const progress = ((coins - league.minCoins) / (nextLeague.minCoins - league.minCoins)) * 100;
  
  return { current: league, next: nextLeague, progress: Math.min(100, progress) };
}

async function updateGlobalStats(coinsChange, tapsChange, usersChange = 0) {
  let stats = await GlobalStats.findOne();
  if (!stats) {
    stats = new GlobalStats();
  }
  
  stats.totalCoins += coinsChange;
  stats.totalTaps += tapsChange;
  stats.totalUsers += usersChange;
  stats.lastUpdated = new Date();
  
  await stats.save();
  return stats;
}

async function addReferralEarnings(referrerId, amount) {
  const referrer = await User.findOne({ telegramId: referrerId });
  if (!referrer) return;
  
  const bonus = Math.floor(amount * 0.1);
  referrer.coins += bonus;
  referrer.totalEarned += bonus;
  referrer.referralEarnings += bonus;
  
  const newLeague = getLeague(referrer.totalEarned);
  referrer.league = newLeague.id;
  
  await referrer.save();
  await updateGlobalStats(bonus, 0);
}

async function checkAndUpdateReferralActivity(userId) {
  const user = await User.findOne({ telegramId: userId });
  if (!user || !user.referredBy) return;
  
  const referrer = await User.findOne({ telegramId: user.referredBy });
  if (!referrer) return;
  
  const activeReferrals = await User.countDocuments({
    referredBy: referrer.telegramId,
    lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  });
  
  referrer.activeReferralCount = activeReferrals;
  await referrer.save();
}

function analyzeAntiCheat(intervals) {
  if (intervals.length < 5) return { suspicious: false, avgInterval: 0 };
  
  const recentIntervals = intervals.slice(-20);
  const sum = recentIntervals.reduce((a, b) => a + b, 0);
  const avg = sum / recentIntervals.length;
  
  const belowThreshold = recentIntervals.filter(i => i < 50).length;
  const suspicious = belowThreshold > 10 || avg < 60;
  
  return { suspicious, avgInterval: Math.round(avg) };
}

async function getBoosterPrice(boosterId, level) {
  let priceDoc = await BoosterPrice.findOne({ boosterId });
  if (!priceDoc) {
    const defaultPrices = {
      'twix': 100,
      'energy2x': 50
    };
    priceDoc = new BoosterPrice({
      boosterId,
      basePrice: defaultPrices[boosterId] || 100
    });
    await priceDoc.save();
  }
  
  const multiplier = boosterId === 'twix' ? 2 : 0.5;
  return Math.floor(priceDoc.basePrice * Math.pow(multiplier, level));
}

app.post('/api/auth/init', authMiddleware, async (req, res) => {
  try {
    const { id, username, first_name, last_name } = req.telegramUser;
    const { referralCode } = req.body;
    
    let user = await User.findOne({ telegramId: id });
    let isNewUser = false;
    
    if (!user) {
      isNewUser = true;
      user = new User({
        telegramId: id,
        username: username || '',
        firstName: first_name || '',
        lastName: last_name || '',
        unlockedSkins: ['default']
      });
      
      if (referralCode) {
        const referrer = await User.findOne({ telegramId: parseInt(referralCode) });
        if (referrer && referrer.telegramId !== id) {
          user.referredBy = referrer.telegramId;
          referrer.referralCount += 1;
          referrer.activeReferralCount += 1;
          await referrer.save();
        }
      }
      
      await user.save();
      await updateGlobalStats(0, 0, 1);
    }
    
    user = await updateEnergy(user);
    user.lastActive = new Date();
    
    const leagueInfo = getLeagueProgress(user.totalEarned);
    
    await user.save();
    await checkAndUpdateReferralActivity(id);
    
    const globalStats = await GlobalStats.findOne();
    
    res.json({
      user: {
        telegramId: user.telegramId,
        username: user.username,
        coins: user.coins,
        totalEarned: user.totalEarned,
        totalTaps: user.totalTaps,
        energy: user.energy,
        maxEnergy: user.maxEnergy,
        tapPower: user.tapPower,
        league: leagueInfo.current,
        leagueProgress: leagueInfo.progress,
        nextLeague: leagueInfo.next,
        activeSkin: user.activeSkin,
        unlockedSkins: user.unlockedSkins,
        boosters: user.boosters,
        completedTasks: user.completedTasks,
        referralCount: user.referralCount,
        activeReferralCount: user.activeReferralCount,
        referralEarnings: user.referralEarnings,
        suspicious: user.suspicious,
        avgTapInterval: user.avgTapInterval
      },
      globalStats: {
        totalCoins: globalStats?.totalCoins || 0,
        totalTaps: globalStats?.totalTaps || 0,
        totalUsers: globalStats?.totalUsers || 0
      },
      isNewUser
    });
  } catch (error) {
    console.error('Init error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// (rest of the file remains unchanged until the mongoose.connect section)

const uri = process.env.MONGODB_URI;

// TEST LOG - sprawdzamy co widzi Koyeb
if (!uri) {
    console.log("❌ KRYTYCZNY BŁĄD: Zmienna MONGODB_URI nie została znaleziona w Koyeb!");
} else {
    // To zamaskuje hasło w logach (zmieni je na ****)
    const maskedUri = uri.replace(/:([^@]+)@/, ":****@");
    console.log("⏳ Próba połączenia z linkiem: " + maskedUri);
}

// FIXED: ensure promise chain is valid (removed stray semicolon that broke chaining)
mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000 // Serwer szybciej powie nam, że coś jest nie tak
})
.then(async () => {
    console.log("✅ SUKCES: Połączono z MongoDB Atlas!");
    console.log('✅ SUKCES: Twoja gra jest połączona z chmurą MongoDB!');

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, async () => {
      console.log(`🚀 Silnik gry pracuje na porcie ${PORT}`);
      console.log(`📡 Czekam na połączenia z Frontendu...`);
      await initializeDefaults();
      console.log('✓ Backend ready!');
    });
})
.catch(err => {
    console.error('❌ KRYTYCZNY BŁĄD POŁĄCZENIA:');
    console.error(`Powód: ${err.message}`);
    console.log('\n--- LISTA KONTROLNA DLA CIEBIE ---');
    console.log('1. Czy w .env hasło jest poprawne? (Pamiętaj o dużych literach!)');
    console.log('2. Czy w MongoDB Atlas status Network Access to "Active" dla 0.0.0.0/0?');
    console.log('3. Czy Twój Firewall w Windows nie blokuje aplikacji Node.js?');
});