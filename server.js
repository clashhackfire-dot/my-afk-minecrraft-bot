const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

const CONFIG_FILE = path.join(__dirname, 'config.json');
let config = {
  password: 'afk2026',
  autoRestart: true,
  liveLog: true,
  persistent: true,
  serverHost: 'localhost',
  serverPort: 25565,
  botUsername: 'AFKBot_77'
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    config = { ...config, ...saved };
  } catch (e) {
    console.error('Error loading config:', e);
  }
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

let botProcess = null;
let botStatus = 'offline';
let logMessages = [];
let playerList = [];
let botHealth = 20;
let botFood = 20;
let botUptime = 0;
let uptimeInterval = null;
let startupTimeout = null;
let connectionAttempts = 0;
let reconnectTimer = null;

function startBot() {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (botProcess) {
    botProcess.kill();
    botProcess = null;
  }
  
  connectionAttempts++;
  console.log(`🤖 Starting bot (attempt ${connectionAttempts})...`);
  botStatus = 'starting';
  broadcast({ type: 'status', data: 'starting' });
  
  // Check if config has valid server
  if (!config.serverHost || config.serverHost === 'localhost') {
    console.warn('⚠️ Warning: Using localhost. Update config.json with your server IP!');
  }
  
  botProcess = spawn('node', ['bot.js'], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  let hasConnected = false;

  botProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      logMessages.push({ time: new Date(), message: msg, type: 'info' });
      broadcast({ type: 'log', data: msg });
      console.log(`[BOT] ${msg}`);
      
      if (msg.includes('✅ Bot spawned!') || msg.includes('online')) {
        hasConnected = true;
        botStatus = 'online';
        connectionAttempts = 0;
        broadcast({ type: 'status', data: 'online' });
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
        }
      }
    }
  });

  botProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      logMessages.push({ time: new Date(), message: msg, type: 'error' });
      broadcast({ type: 'log', data: `❌ ${msg}` });
      console.error(`[BOT ERROR] ${msg}`);
      
      if (msg.includes('ECONNREFUSED') || msg.includes('connect') || msg.includes('timeout') || msg.includes('Authentication')) {
        botStatus = 'error';
        broadcast({ type: 'status', data: 'error' });
      }
    }
  });

  botProcess.on('message', (message) => {
    if (message.type === 'status') {
      botStatus = message.data;
      broadcast({ type: 'status', data: botStatus });
      
      if (botStatus === 'online') {
        hasConnected = true;
        connectionAttempts = 0;
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
        }
        botUptime = 0;
        if (!uptimeInterval) {
          uptimeInterval = setInterval(() => {
            botUptime++;
            broadcast({ type: 'uptime', data: botUptime });
          }, 1000);
        }
      }
    } else if (message.type === 'players') {
      playerList = message.data;
      broadcast({ type: 'players', data: playerList });
    } else if (message.type === 'health') {
      botHealth = message.data.health;
      botFood = message.data.food;
      broadcast({ type: 'health', data: { health: botHealth, food: botFood } });
    }
  });

  botProcess.on('close', (code) => {
    console.log(`Bot process closed with code ${code}`);
    if (startupTimeout) {
      clearTimeout(startupTimeout);
      startupTimeout = null;
    }
    
    if (!hasConnected) {
      botStatus = 'error';
      broadcast({ type: 'status', data: 'error' });
      logMessages.push({ 
        time: new Date(), 
        message: `❌ Connection failed (attempt ${connectionAttempts})`, 
        type: 'error' 
      });
    }
    
    if (uptimeInterval) {
      clearInterval(uptimeInterval);
      uptimeInterval = null;
    }
    
    // Auto-restart with backoff
    if (config.autoRestart) {
      const delay = Math.min(connectionAttempts * 2000, 30000); // Max 30 seconds
      logMessages.push({ 
        time: new Date(), 
        message: `🔄 Reconnecting in ${Math.round(delay/1000)}s...`, 
        type: 'info' 
      });
      
      reconnectTimer = setTimeout(() => {
        logMessages.push({ time: new Date(), message: '🔄 Auto-restarting bot...', type: 'info' });
        startBot();
      }, delay);
    }
  });

  // Startup timeout
  startupTimeout = setTimeout(() => {
    if (botStatus === 'starting' && !hasConnected) {
      botStatus = 'error';
      broadcast({ type: 'status', data: 'error' });
      logMessages.push({ 
        time: new Date(), 
        message: '⚠️ Bot startup timeout! Check server connection.', 
        type: 'error' 
      });
    }
    startupTimeout = null;
  }, 15000);
}

const clients = new Set();

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  clients.add(ws);
  
  ws.send(JSON.stringify({ 
    type: 'init', 
    data: {
      status: botStatus,
      players: playerList,
      health: { health: botHealth, food: botFood },
      logs: logMessages.slice(-50),
      config: config,
      uptime: botUptime
    }
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'chat') {
        if (botProcess) {
          botProcess.send({ type: 'chat', data: data.message });
        }
      } else if (data.type === 'command') {
        if (data.command === 'restart') {
          restartBot();
        }
      } else if (data.type === 'config') {
        config = { ...config, ...data.data };
        saveConfig();
        broadcast({ type: 'config', data: config });
        if (data.data.serverHost || data.data.serverPort) {
          restartBot();
        }
      }
    } catch (e) {
      console.error('WebSocket error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function restartBot() {
  logMessages.push({ time: new Date(), message: '🔄 Restarting bot...', type: 'info' });
  if (botProcess) {
    botProcess.kill();
    botProcess = null;
  }
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  connectionAttempts = 0;
  setTimeout(() => startBot(), 500);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: botStatus,
    players: playerList,
    health: { health: botHealth, food: botFood },
    uptime: botUptime,
    logs: logMessages.slice(-20)
  });
});

app.post('/api/config', (req, res) => {
  config = { ...config, ...req.body };
  saveConfig();
  res.json({ success: true, config });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
  console.log(`📁 Config file: ${CONFIG_FILE}`);
  console.log(`🌐 Server: ${config.serverHost}:${config.serverPort}`);
  console.log(`🤖 Bot: ${config.botUsername}`);
  startBot();
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  if (botProcess) botProcess.kill();
  if (uptimeInterval) clearInterval(uptimeInterval);
  if (startupTimeout) clearTimeout(startupTimeout);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit();
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  if (botProcess) botProcess.kill();
  if (uptimeInterval) clearInterval(uptimeInterval);
  if (startupTimeout) clearTimeout(startupTimeout);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  process.exit();
});
