const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;

const config = require('./config.json');

console.log(`🔌 Connecting to ${config.serverHost}:${config.serverPort} as ${config.botUsername}`);

const bot = mineflayer.createBot({
  host: config.serverHost || 'localhost',
  port: config.serverPort || 25565,
  username: config.botUsername || 'AFKBot_77',
  version: false,
  auth: 'offline',
  connectTimeout: 10000, // 10 second timeout
  checkTimeoutInterval: 5000
});

bot.loadPlugin(pathfinder);

// Send status immediately
if (process.send) {
  process.send({ type: 'status', data: 'starting' });
}

let isAFK = true;

bot.once('spawn', () => {
  console.log('✅ Bot spawned successfully!');
  if (process.send) {
    process.send({ type: 'status', data: 'online' });
  }
  
  // Start AFK behavior
  setInterval(() => {
    if (isAFK && bot.health) {
      if (Math.random() < 0.3) {
        try {
          const mcData = require('minecraft-data')(bot.version);
          const defaultMove = new Movements(bot, mcData);
          bot.pathfinder.setMovements(defaultMove);
          
          const x = bot.entity.position.x + (Math.random() - 0.5) * 3;
          const z = bot.entity.position.z + (Math.random() - 0.5) * 3;
          bot.pathfinder.setGoal(new pathfinder.goals.GoalBlock(
            Math.floor(x), 
            Math.floor(bot.entity.position.y), 
            Math.floor(z)
          ));
        } catch (e) {}
      }
    }
  }, 5000);
});

// Quick health reporting
bot.on('health', () => {
  if (bot.health && process.send) {
    process.send({ 
      type: 'health', 
      data: { 
        health: Math.round(bot.health), 
        food: Math.round(bot.food) 
      } 
    });
  }
});

// Player list
bot.on('playerJoined', updatePlayerList);
bot.on('playerLeft', updatePlayerList);

function updatePlayerList() {
  if (!process.send) return;
  const players = Object.values(bot.players).map(p => ({
    username: p.username,
    health: p.entity?.health || 20,
    ping: p.ping
  }));
  process.send({ type: 'players', data: players });
}

// Chat handler
bot.on('chat', (username, message) => {
  console.log(`💬 ${username}: ${message}`);
  if (username === bot.username) return;
  
  if (message.toLowerCase().includes('afk') || 
      message.toLowerCase().includes('hello') ||
      message.toLowerCase().includes('hi')) {
    setTimeout(() => {
      const responses = [`I'm AFK right now!`, `Hello! I'm AFK farming.`, `👋 AFK at the moment!`];
      bot.chat(`/msg ${username} ${responses[Math.floor(Math.random() * responses.length)]}`);
    }, 1000);
  }
});

// Process messages
if (process.send) {
  process.on('message', (message) => {
    if (message.type === 'chat') {
      bot.chat(message.data);
    }
  });
}

// Error handling - Fast fail
bot.on('error', (err) => {
  console.error('❌ Bot error:', err.message);
  if (process.send) {
    process.send({ type: 'status', data: 'error' });
    process.send({ type: 'log', data: `Error: ${err.message}` });
  }
  // Don't exit on error, let server.js handle restart
});

bot.on('end', (reason) => {
  console.log('Bot disconnected:', reason);
  if (process.send) {
    process.send({ type: 'status', data: 'offline' });
  }
});

console.log('🤖 Bot initialized');
