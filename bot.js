
---

## **bot.js**
```javascript
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const AutoEat = require('mineflayer-auto-eat');

const config = require('./config.json');

const bot = mineflayer.createBot({
  host: config.serverHost || 'localhost',
  port: config.serverPort || 25565,
  username: config.botUsername || 'AFKBot_77',
  version: false,
  auth: 'offline'
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(AutoEat);

let isAFK = true;
let lastActivity = Date.now();

bot.once('spawn', () => {
  console.log('✅ Bot spawned!');
  process.send({ type: 'status', data: 'online' });
  
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

  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 14,
    bannedFood: []
  };
  
  bot.on('autoeat_started', () => {
    console.log('🍽️ Eating...');
  });
});

bot.on('health', () => {
  if (bot.health) {
    process.send({ 
      type: 'health', 
      data: { 
        health: Math.round(bot.health), 
        food: Math.round(bot.food) 
      } 
    });
  }
});

bot.on('playerJoined', () => {
  updatePlayerList();
});

bot.on('playerLeft', () => {
  updatePlayerList();
});

function updatePlayerList() {
  const players = Object.values(bot.players).map(p => ({
    username: p.username,
    health: p.entity?.health || 20,
    food: p.food || 20,
    ping: p.ping
  }));
  process.send({ type: 'players', data: players });
}

bot.on('chat', (username, message) => {
  console.log(`💬 ${username}: ${message}`);
  if (username === bot.username) return;
  
  if (message.toLowerCase().includes('afk') || 
      message.toLowerCase().includes('hello') ||
      message.toLowerCase().includes('hi') ||
      message.toLowerCase().includes('hey')) {
    setTimeout(() => {
      const responses = [
        `I'm AFK right now!`,
        `Hello! I'm AFK farming.`,
        `👋 AFK at the moment!`
      ];
      const response = responses[Math.floor(Math.random() * responses.length)];
      bot.chat(`/msg ${username} ${response}`);
    }, 1000);
  }
  
  if (message.startsWith('/')) {
    if (message.includes('restart') && username === 'admin') {
      process.send({ type: 'command', data: 'restart' });
    }
  }
});

process.on('message', (message) => {
  if (message.type === 'chat') {
    bot.chat(message.data);
  } else if (message.type === 'command') {
    if (message.data === 'restart') {
      console.log('🔄 Restarting bot...');
      bot.end('Restarting');
    }
  }
});

bot.on('error', (err) => {
  console.error('❌ Bot error:', err);
  process.send({ type: 'status', data: 'error' });
});

bot.on('end', (reason) => {
  console.log('Bot disconnected:', reason);
  process.send({ type: 'status', data: 'offline' });
  
  if (config.autoRestart) {
    setTimeout(() => {
      console.log('🔄 Reconnecting...');
      bot.connect();
    }, 5000);
  }
});

function sendStatus(status) {
  process.send({ type: 'status', data: status });
}

console.log('🤖 Bot initialized with config:', config);

setInterval(() => {
  process.send({ type: 'heartbeat' });
}, 30000);