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

function startBot() {
  if (botProcess) {
    botProcess.kill();
  }
  
  botProcess = spawn('node', ['bot.js'], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  botProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      logMessages.push({ time: new Date(), message: msg, type: 'info' });
      broadcast({ type: 'log', data: msg });
      console.log(`[BOT] ${msg}`);
    }
  });

  botProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      logMessages.push({ time: new Date(), message: msg, type: 'error' });
      broadcast({ type: 'log', data: `❌ ${msg}` });
      console.error(`[BOT ERROR] ${msg}`);
    }
  });

  botProcess.on('message', (message) => {
    if (message.type === 'status') {
      botStatus = message.data;
      broadcast({ type: 'status', data: botStatus });
      
      if (botStatus === 'online' && !uptimeInterval) {
        botUptime = 0;
        uptimeInterval = setInterval(() => {
          botUptime++;
          broadcast({ type: 'uptime', data: botUptime });
        }, 1000);
      } else if (botStatus !== 'online' && uptimeInterval) {
        clearInterval(uptimeInterval);
        uptimeInterval = null;
      }
    } else if (message.type === 'players') {
      playerList = message.data;
      broadcast({ type: 'players', data: playerList });
    } else if (message.type === 'health') {
      botHealth = message.data.health;
      botFood = message.data.food;
      broadcast({ type: 'health', data: { health: botHealth, food: botFood } });
    } else if (message.type === 'heartbeat') {
    }
  });

  botProcess.on('close', (code) => {
    botStatus = 'offline';
    broadcast({ type: 'status', data: 'offline' });
    
    if (uptimeInterval) {
      clearInterval(uptimeInterval);
      uptimeInterval = null;
    }
    
    logMessages.push({ 
      time: new Date(), 
      message: `Bot stopped (code ${code})`, 
      type: 'error' 
    });
    
    if (config.autoRestart) {
      setTimeout(() => {
        logMessages.push({ time: new Date(), message: '🔄 Auto-restarting bot...', type: 'info' });
        startBot();
      }, 3000);
    }
  });

  botStatus = 'starting';
  broadcast({ type: 'status', data: 'starting' });
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
          logMessages.push({ 
            time: new Date(), 
            message: `💬 [DASHBOARD] ${data.message}`, 
            type: 'info' 
          });
        }
      } else if (data.type === 'command') {
        if (data.command === 'restart') {
          restartBot();
        } else if (data.command === 'kick') {
          simulateKick();
        }
      } else if (data.type === 'config') {
        config = { ...config, ...data.data };
        saveConfig();
        broadcast({ type: 'config', data: config });
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function restartBot() {
  logMessages.push({ time: new Date(), message: '🔄 Manual restart requested', type: 'info' });
  if (botProcess) {
    botProcess.kill();
  }
  setTimeout(() => startBot(), 1000);
}

function simulateKick() {
  logMessages.push({ time: new Date(), message: '⚠️ Bot kicked! (simulated)', type: 'error' });
  if (botProcess) {
    botProcess.kill();
  }
  botStatus = 'kicked';
  broadcast({ type: 'status', data: 'kicked' });
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

app.get('/api/players', (req, res) => {
  res.json(playerList);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
  console.log(`📁 Config file: ${CONFIG_FILE}`);
  startBot();
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  if (botProcess) botProcess.kill();
  if (uptimeInterval) clearInterval(uptimeInterval);
  process.exit();
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down...');
  if (botProcess) botProcess.kill();
  if (uptimeInterval) clearInterval(uptimeInterval);
  process.exit();
});