const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;

const config = require('./config.json');

const bot = mineflayer.createBot({
  host: config.serverHost || 'localhost',
  port: config.serverPort || 25565,
  username: config.botUsername || 'AFKBot_77',
  version: false,
  auth: 'offline'
});

bot.loadPlugin(pathfinder);

let isAFK = true;
let lastActivity = Date.now();

bot.once('spawn', () => {
  console.log('✅ Bot spawned!');
  if (process.send) {
    process.send({ type: 'status', data: 'online' });
  }
  
  // Start AFK behavior - random movement to avoid AFK kick
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
        } catch (e) {
          // Ignore pathfinding errors
        }
      }
    }
  }, 5000);

  // Simple auto-eat (manual check instead of plugin)
  setInterval(() => {
    if (bot.food && bot.food < 14 && bot.health) {
      // Find food in inventory and eat
      try {
        const food = bot.inventory.items().find(item => 
          item.name.includes('apple') || 
          item.name.includes('bread') || 
          item.name.includes('cooked') ||
          item.name.includes('steak') ||
          item.name.includes('pork') ||
          item.name.includes('chicken') ||
          item.name.includes('carrot') ||
          item.name.includes('potato')
        );
        if (food) {
          bot.equip(food, 'hand');
          bot.consume();
          console.log('🍽️ Eating food');
        }
      } catch (e) {
        // Ignore eating errors
      }
    }
  }, 3000);
});

// Health monitoring
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
bot.on('playerJoined', () => {
  updatePlayerList();
});

bot.on('playerLeft', () => {
  updatePlayerList();
});

function updatePlayerList() {
  if (!process.send) return;
  const players = Object.values(bot.players).map(p => ({
    username: p.username,
    health: p.entity?.health || 20,
    food: p.food || 20,
    ping: p.ping
  }));
  process.send({ type: 'players', data: players });
}

// Handle chat
bot.on('chat', (username, message) => {
  console.log(`💬 ${username}: ${message}`);
  if (username === bot.username) return;
  
  // Auto-response to AFK messages
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
});

// Process messages from parent
if (process.send) {
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
}

// Error handling
bot.on('error', (err) => {
  console.error('❌ Bot error:', err);
  if (process.send) {
    process.send({ type: 'status', data: 'error' });
  }
});

bot.on('end', (reason) => {
  console.log('Bot disconnected:', reason);
  if (process.send) {
    process.send({ type: 'status', data: 'offline' });
  }
  
  // Auto-reconnect if configured
  if (config.autoRestart) {
    setTimeout(() => {
      console.log('🔄 Reconnecting...');
      bot.connect();
    }, 5000);
  }
});

console.log('🤖 Bot initialized with config:', config);

// Keep process alive
if (process.send) {
  setInterval(() => {
    process.send({ type: 'heartbeat' });
  }, 30000);
}
