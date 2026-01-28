require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const http = require('http');
const socketIo = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

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

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend is running!',
    message: '🚀 TapSwap Game API',
    endpoints: ['/api/auth/init', '/api/tap', '/api/user']
  });
});

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

console.log('✅ Helper functions loaded');
// ===== AUTH INIT ENDPOINT =====
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

console.log('✅ Auth init endpoint loaded');

// ===== TAP ENDPOINT =====
app.post('/api/tap', authMiddleware, async (req, res) => {
  try {
    const { taps, interval } = req.body;
    
    if (!taps || taps < 1 || taps > 100) {
      return res.status(400).json({ error: 'Invalid tap count' });
    }
    
    let user = await User.findOne({ telegramId: req.telegramUser.id });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user = await updateEnergy(user);
    
    const energyCost = taps;
    if (user.energy < energyCost) {
      return res.status(400).json({ error: 'Not enough energy' });
    }
    
    let tapPower = user.tapPower;
    if (user.boosters.twix.active && user.boosters.twix.expiresAt > new Date()) {
      tapPower *= 2;
    }
    
    const coinsEarned = taps * tapPower;
    
    user.energy -= energyCost;
    user.coins += coinsEarned;
    user.totalEarned += coinsEarned;
    user.totalTaps += taps;
    user.lastActive = new Date();
    
    if (interval) {
      user.tapIntervals.push(interval);
      if (user.tapIntervals.length > 50) {
        user.tapIntervals = user.tapIntervals.slice(-50);
      }
      
      const antiCheatResult = analyzeAntiCheat(user.tapIntervals);
      user.suspicious = antiCheatResult.suspicious;
      user.avgTapInterval = antiCheatResult.avgInterval;
      
      if (antiCheatResult.suspicious) {
        io.emit('suspicious-activity', {
          userId: user.telegramId,
          username: user.username,
          avgInterval: antiCheatResult.avgInterval
        });
      }
    }
    
    const leagueInfo = getLeagueProgress(user.totalEarned);
    user.league = leagueInfo.current.id;
    
    await user.save();
    await updateGlobalStats(coinsEarned, taps);
    
    if (user.referredBy) {
      await addReferralEarnings(user.referredBy, coinsEarned);
    }
    
    res.json({
      coins: user.coins,
      totalEarned: user.totalEarned,
      energy: user.energy,
      coinsEarned,
      league: leagueInfo.current,
      leagueProgress: leagueInfo.progress,
      nextLeague: leagueInfo.next
    });
  } catch (error) {
    console.error('Tap error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Tap endpoint loaded');

// ===== BOOSTERS ACTIVATE =====
app.post('/api/boosters/activate', authMiddleware, async (req, res) => {
  try {
    const { boosterId, duration, type, isFree } = req.body;
    const userId = req.telegramUser.id;

    const user = await User.findOne({ telegramId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'User is banned' });
    }

    if (!user.boosters) {
      user.boosters = {};
    }

    let expiresAt;

    if (type === 'autoclicker') {
      if (user.boosters.autoclicker && user.boosters.autoclicker.active && new Date(user.boosters.autoclicker.expiresAt) > new Date()) {
        const existingExpiry = new Date(user.boosters.autoclicker.expiresAt);
        expiresAt = new Date(existingExpiry.getTime() + duration * 60 * 60 * 1000);
        console.log(`🤖 User ${user.username} stacked autoclicker: +${duration}h (total: ${Math.round((expiresAt - new Date()) / (1000 * 60 * 60))}h)`);
      } else {
        expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
        console.log(`🤖 User ${user.username} activated autoclicker for ${duration}h`);
      }
      
      user.boosters.autoclicker = {
        active: true,
        expiresAt: expiresAt,
        lastTap: new Date()
      };
      
    } else if (type === 'stamina') {
      if (user.boosters.stamina && user.boosters.stamina.active && new Date(user.boosters.stamina.expiresAt) > new Date()) {
        const existingExpiry = new Date(user.boosters.stamina.expiresAt);
        expiresAt = new Date(existingExpiry.getTime() + duration * 60 * 60 * 1000);
        console.log(`⚡ User ${user.username} stacked stamina: +${duration}h (total: ${Math.round((expiresAt - new Date()) / (1000 * 60 * 60))}h)`);
      } else {
        expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
        console.log(`⚡ User ${user.username} activated stamina for ${duration}h`);
      }
      
      const originalMaxEnergy = user.boosters.stamina?.originalMaxEnergy || user.maxEnergy;
      user.maxEnergy = originalMaxEnergy + 1000;
      
      user.boosters.stamina = {
        active: true,
        expiresAt: expiresAt,
        originalMaxEnergy: originalMaxEnergy
      };
    }

    await user.save();

    res.json({
      success: true,
      boosters: user.boosters,
      maxEnergy: user.maxEnergy,
      message: isFree ? 'Free trial activated!' : 'Booster stacked successfully!'
    });
  } catch (error) {
    console.error('Booster activation error:', error);
    res.status(500).json({ error: 'Failed to activate booster' });
  }
});

console.log('✅ Booster activation endpoint loaded');

// ===== AUTOCLICKER PROCESS =====
app.post('/api/autoclicker/process', authMiddleware, async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.boosters?.autoclicker?.active || new Date(user.boosters.autoclicker.expiresAt) <= new Date()) {
      return res.json({ active: false, coins: user.coins, energy: user.energy });
    }

    const now = new Date();
    const lastTap = user.boosters.autoclicker.lastTap ? new Date(user.boosters.autoclicker.lastTap) : now;
    const secondsPassed = Math.floor((now - lastTap) / 1000);
    
    if (secondsPassed < 1) {
      return res.json({ active: true, coins: user.coins, energy: user.energy });
    }

    const taps = Math.min(secondsPassed, 60);
    const energyCost = taps;

    if (user.energy < energyCost) {
      return res.json({ active: true, coins: user.coins, energy: user.energy, waiting: true });
    }

    const coinsEarned = taps * user.tapPower;
    user.coins += coinsEarned;
    user.totalEarned += coinsEarned;
    user.totalTaps += taps;
    user.energy -= energyCost;
    user.boosters.autoclicker.lastTap = now;
    user.lastActive = new Date();

    const newLeague = getLeague(user.totalEarned);
    user.league = newLeague.id;

    await user.save();
    await updateGlobalStats(coinsEarned, taps);

    if (user.referredBy) {
      await addReferralEarnings(user.referredBy, coinsEarned);
    }

    console.log(`🤖 Autoclicker: ${user.username} earned ${coinsEarned} coins (${taps} taps)`);

    res.json({
      active: true,
      coins: user.coins,
      totalEarned: user.totalEarned,
      energy: user.energy,
      coinsEarned,
      taps,
      expiresAt: user.boosters.autoclicker.expiresAt
    });
  } catch (error) {
    console.error('Autoclicker process error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Autoclicker process endpoint loaded');

// ===== UPGRADES ENDPOINTS =====
app.post('/api/upgrades/tap-power', authMiddleware, async (req, res) => {
  try {
    const { level } = req.body;
    const userId = req.telegramUser.id;

    const user = await User.findOne({ telegramId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'User is banned' });
    }

    const tapPowerLevels = [
      { level: 1, power: 2, cost: 3000 },
      { level: 2, power: 4, cost: 6000 },
      { level: 3, power: 8, cost: 12000 },
      { level: 4, power: 16, cost: 24000 },
      { level: 5, power: 32, cost: 48000 }
    ];

    const upgrade = tapPowerLevels.find(u => u.level === level);
    if (!upgrade) {
      return res.status(400).json({ error: 'Invalid level' });
    }

    const currentLevel = user.tapPower === 1 ? 0 : Math.log2(user.tapPower);
    if (currentLevel >= level) {
      return res.status(400).json({ error: 'Already upgraded to this level or higher' });
    }

    if (level !== currentLevel + 1) {
      return res.status(400).json({ error: 'Must upgrade levels sequentially' });
    }

    if (user.coins < upgrade.cost) {
      return res.status(400).json({ error: 'Not enough coins' });
    }

    user.coins -= upgrade.cost;
    user.tapPower = upgrade.power;
    user.lastActive = new Date();

    await user.save();
    await updateGlobalStats(-upgrade.cost, 0);

    console.log(`⬆️ User ${user.username} upgraded tap power to level ${level} (${upgrade.power}x)`);

    res.json({
      success: true,
      coins: user.coins,
      tapPower: user.tapPower,
      level: level
    });
  } catch (error) {
    console.error('Tap power upgrade error:', error);
    res.status(500).json({ error: 'Failed to upgrade' });
  }
});

app.post('/api/upgrades/stamina', authMiddleware, async (req, res) => {
  try {
    const { level } = req.body;
    const userId = req.telegramUser.id;

    const user = await User.findOne({ telegramId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'User is banned' });
    }

    const staminaLevels = [
      { level: 1, stamina: 2000, cost: 7000 },
      { level: 2, stamina: 3000, cost: 12600 },
      { level: 3, stamina: 4000, cost: 22680 },
      { level: 4, stamina: 5000, cost: 40824 },
      { level: 5, stamina: 6000, cost: 73483 }
    ];

    const upgrade = staminaLevels.find(u => u.level === level);
    if (!upgrade) {
      return res.status(400).json({ error: 'Invalid level' });
    }

    const currentLevel = Math.floor((user.maxEnergy - 1000) / 1000);
    if (currentLevel >= level) {
      return res.status(400).json({ error: 'Already upgraded to this level or higher' });
    }

    if (level !== currentLevel + 1) {
      return res.status(400).json({ error: 'Must upgrade levels sequentially' });
    }

    if (user.coins < upgrade.cost) {
      return res.status(400).json({ error: 'Not enough coins' });
    }

    user.coins -= upgrade.cost;
    user.maxEnergy = upgrade.stamina;
    user.energy = Math.min(user.energy, user.maxEnergy);
    user.lastActive = new Date();

    await user.save();
    await updateGlobalStats(-upgrade.cost, 0);

    console.log(`⬆️ User ${user.username} upgraded stamina to level ${level} (${upgrade.stamina})`);

    res.json({
      success: true,
      coins: user.coins,
      maxEnergy: user.maxEnergy,
      energy: user.energy,
      level: level
    });
  } catch (error) {
    console.error('Stamina upgrade error:', error);
    res.status(500).json({ error: 'Failed to upgrade' });
  }
});

console.log('✅ Upgrades endpoints loaded');
// ===== TASKS ENDPOINTS =====
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({ enabled: true });
    const user = await User.findOne({ telegramId: req.telegramUser.id });
    
    const tasksWithStatus = tasks.map(task => ({
      taskId: task.taskId,
      category: task.category,
      title: task.title,
      description: task.description,
      reward: task.reward,
      url: task.url,
      icon: task.icon,
      completed: user.completedTasks.includes(task.taskId)
    }));
    
    res.json(tasksWithStatus);
  } catch (error) {
    console.error('Tasks fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tasks/complete', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.body;
    
    const task = await Task.findOne({ taskId, enabled: true });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    let user = await User.findOne({ telegramId: req.telegramUser.id });
    
    if (user.completedTasks.includes(taskId)) {
      return res.status(400).json({ error: 'Task already completed' });
    }
    
    user.completedTasks.push(taskId);
    user.coins += task.reward;
    user.totalEarned += task.reward;
    
    const leagueInfo = getLeagueProgress(user.totalEarned);
    user.league = leagueInfo.current.id;
    
    await user.save();
    await updateGlobalStats(task.reward, 0);
    
    if (user.referredBy) {
      await addReferralEarnings(user.referredBy, task.reward);
    }
    
    res.json({
      coins: user.coins,
      totalEarned: user.totalEarned,
      reward: task.reward,
      completedTasks: user.completedTasks,
      league: leagueInfo.current,
      leagueProgress: leagueInfo.progress
    });
  } catch (error) {
    console.error('Task complete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Tasks endpoints loaded');

// ===== REFERRALS ENDPOINTS =====
app.get('/api/referrals', authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.telegramUser.id });
    const referrals = await User.find({ referredBy: user.telegramId });
    
    const referralList = referrals.map(ref => {
      const league = getLeague(ref.totalEarned);
      const isActive = (Date.now() - ref.lastActive.getTime()) < 7 * 24 * 60 * 60 * 1000;
      
      return {
        id: ref.telegramId,
        username: ref.username || 'Anonymous',
        earnings: ref.totalEarned,
        league: league.name,
        leagueColor: league.color,
        isActive,
        lastActive: ref.lastActive
      };
    });
    
    res.json({
      referralCode: user.telegramId.toString(),
      referralCount: user.referralCount,
      activeReferralCount: user.activeReferralCount,
      referralEarnings: user.referralEarnings,
      referrals: referralList
    });
  } catch (error) {
    console.error('Referrals fetch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Referrals endpoints loaded');

// ===== LEAGUE RANKINGS =====
app.get('/api/league/rankings', authMiddleware, async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const user = await User.findOne({ telegramId: userId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const myLeague = await User.find({ 
      league: user.league,
      banned: { $ne: true }
    })
    .sort({ totalEarned: -1 })
    .limit(100)
    .select('telegramId username totalEarned coins league')
    .lean();

    const allLeagues = await User.aggregate([
      { $match: { banned: { $ne: true } } },
      { $group: { _id: '$league', count: { $sum: 1 } } }
    ]);

    res.json({
      myLeague: myLeague || [],
      allLeagues: allLeagues || []
    });
  } catch (error) {
    console.error('League rankings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ League rankings endpoint loaded');

// ===== TELEGRAM STARS PAYMENT =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

app.post('/api/stars/create-invoice', authMiddleware, async (req, res) => {
  try {
    const { boosterId, title, description, amount } = req.body;
    const userId = req.telegramUser.id;

    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ error: 'Bot token not configured' });
    }

    const invoiceData = {
      title: title,
      description: description,
      payload: JSON.stringify({ 
        userId, 
        boosterId, 
        type: 'booster_purchase',
        timestamp: Date.now()
      }),
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: title, amount: amount }]
    };

    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createInvoiceLink`,
      invoiceData
    );

    if (!telegramResponse.data.ok) {
      console.error('❌ Telegram API error:', telegramResponse.data);
      return res.status(500).json({ error: 'Failed to create invoice' });
    }

    const invoiceLink = telegramResponse.data.result;

    console.log('✅ Invoice created:', boosterId, 'Amount:', amount, 'Stars');

    res.json({ 
      success: true,
      invoiceLink,
      amount,
      boosterId
    });
  } catch (error) {
    console.error('❌ Create invoice error:', error.message);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

console.log('✅ Telegram Stars payment endpoints loaded');

// ===== BACKGROUND AUTOCLICKER CRON =====
async function processAllAutoclickers() {
  try {
    const now = new Date();
    const activeUsers = await User.find({
      'boosters.autoclicker.active': true,
      'boosters.autoclicker.expiresAt': { $gt: now },
      banned: false
    });

    if (activeUsers.length === 0) return;

    let totalCoinsEarned = 0;
    let totalTaps = 0;

    for (const user of activeUsers) {
      try {
        const lastTap = user.boosters.autoclicker.lastTap || user.boosters.autoclicker.expiresAt;
        const secondsPassed = Math.floor((now - new Date(lastTap)) / 1000);
        
        if (secondsPassed < 1) continue;

        const taps = Math.min(secondsPassed, 3600);
        await updateEnergy(user);
        
        const possibleTaps = Math.min(taps, user.energy);
        if (possibleTaps < 1) continue;

        const coinsEarned = possibleTaps * user.tapPower;
        user.coins += coinsEarned;
        user.totalEarned += coinsEarned;
        user.totalTaps += possibleTaps;
        user.energy -= possibleTaps;
        user.boosters.autoclicker.lastTap = now;

        const newLeague = getLeague(user.totalEarned);
        user.league = newLeague.id;

        await user.save();

        totalCoinsEarned += coinsEarned;
        totalTaps += possibleTaps;

        if (user.referredBy) {
          await addReferralEarnings(user.referredBy, coinsEarned);
        }
      } catch (error) {
        console.error(`Error processing user ${user.username}:`, error);
      }
    }

    if (totalTaps > 0) {
      await updateGlobalStats(totalCoinsEarned, totalTaps);
      console.log(`🤖 Batch: ${totalTaps} taps, ${totalCoinsEarned} coins`);
    }
  } catch (error) {
    console.error('Autoclicker cron error:', error);
  }
}

setInterval(processAllAutoclickers, 10000);

console.log('✅ Background autoclicker started (runs every 10s)');

// ===== OFFLINE EARNINGS =====
app.get('/api/autoclicker/offline-earnings', authMiddleware, async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const user = await User.findOne({ telegramId: userId });
    
    if (!user || !user.boosters?.autoclicker?.active) {
      return res.json({ hadAutoclicker: false, coinsEarned: 0, timeAway: 0 });
    }

    const now = new Date();
    const lastTap = new Date(user.boosters.autoclicker.lastTap || now);
    const expiresAt = new Date(user.boosters.autoclicker.expiresAt);
    
    let timeAwaySeconds = 0;
    
    if (expiresAt > now) {
      timeAwaySeconds = Math.floor((now - lastTap) / 1000);
    } else {
      timeAwaySeconds = Math.floor((expiresAt - lastTap) / 1000);
    }

    const coinsEarned = timeAwaySeconds * user.tapPower;
    
    const hours = Math.floor(timeAwaySeconds / 3600);
    const minutes = Math.floor((timeAwaySeconds % 3600) / 60);
    const timeAwayFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    res.json({
      hadAutoclicker: true,
      coinsEarned,
      timeAwaySeconds,
      timeAwayFormatted,
      stillActive: expiresAt > now
    });
  } catch (error) {
    console.error('Offline earnings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

console.log('✅ Offline earnings endpoint loaded');
console.log('✅ All endpoints loaded');

// ===== INITIALIZE DEFAULTS =====
async function initializeDefaults() {
  const taskCount = await Task.countDocuments();
  if (taskCount === 0) {
    const defaultTasks = [
      {
        taskId: 'tg_channel',
        category: 'telegram',
        title: 'Join Telegram Channel',
        description: 'Subscribe to our channel',
        reward: 500,
        url: 'https://t.me/your_channel',
        icon: '📢'
      }
    ];
    
    await Task.insertMany(defaultTasks);
    console.log('✓ Default tasks initialized');
  }
  
  let globalStats = await GlobalStats.findOne();
  if (!globalStats) {
    globalStats = new GlobalStats();
    await globalStats.save();
    console.log('✓ Global stats initialized');
  }
}

// ===== MONGOOSE CONNECT =====
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(async () => {
  console.log('✅ SUKCES: Połączono z MongoDB Atlas!');
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
