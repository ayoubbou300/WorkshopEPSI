const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const Telemetry = require('./models/Telemetry');
const Alert = require('./models/Alert');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/sentinel_db';
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://mosquitto:1883';

// ── LOG DES CONNEXIONS ET TENTATIVES DANS UN FICHIER TEXTE ──
const LOG_FILE_PATH = path.join(__dirname, 'wifi_connections.txt');
const loggedIPs = new Set();

function writeSecurityLog(entry) {
  const timeStr = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const line = `[${timeStr}] ${entry}\n`;
  fs.appendFile(LOG_FILE_PATH, line, (err) => {
    if (err) console.error('[LOG ERROR] Échec d\'écriture dans wifi_connections.txt:', err);
    else console.log(`[LOG SÉCURITÉ] ${entry}`);
  });
}

// Middleware de journalisation des accès web IP
app.use((req, res, next) => {
  const rawIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'Inconnue';
  const cleanIP = rawIP.replace('::ffff:', '');
  if (!loggedIPs.has(cleanIP) && cleanIP !== '127.0.0.1' && cleanIP !== '::1') {
    loggedIPs.add(cleanIP);
    writeSecurityLog(`🌐 PREMIÈRE CONNEXION WEB -> IP: ${cleanIP} | Agent: ${req.headers['user-agent'] || 'Inconnu'}`);
  }
  next();
});

// ── 1. CONNEXION MONGODB ──
mongoose.connect(MONGO_URI)
  .then(() => console.log('[MongoDB] ✅ Connecté avec succès à sentinel_db !'))
  .catch(err => console.error('[MongoDB] ❌ Erreur de connexion:', err));

// ── 2. CONNEXION BROKER MQTT ──
const mqttClient = mqtt.connect(MQTT_BROKER);
const DB_SAVE_INTERVAL_MS = 5000;
let lastDbSaveTime = 0;

mqttClient.on('connect', () => {
  console.log('[MQTT] ✅ Connecté au broker Mosquitto !');
  mqttClient.subscribe(['sentinel/telemetry', 'sentinel/alerts/vision', 'sentinel/security/wifi_attempt'], (err) => {
    if (!err) console.log('[MQTT] S\'est abonné aux topics sentinel/#');
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    if (topic === 'sentinel/telemetry') {
      const now = Date.now();
      
      // Sauvegarde télémétrie filtrée (1 fois toutes les 5s)
      if (now - lastDbSaveTime >= DB_SAVE_INTERVAL_MS) {
        lastDbSaveTime = now;
        const doc = new Telemetry({
          device_id: payload.device_id || 'SENTINEL-NODE-01',
          temperature: payload.temperature,
          humidity: payload.humidity,
          gas: payload.gas,
          motion: payload.motion
        });
        await doc.save();
      }

      // Alertes prioritaires d'intrusion / température
      if (payload.motion) {
        await new Alert({
          type: 'PIR_MOTION',
          message: '⚠️ Détection de mouvement infrarouge (Intrusion) !',
          details: payload
        }).save();
      }

      if (payload.temperature >= 35.0) {
        await new Alert({
          type: 'HIGH_TEMP',
          message: `🔥 Alerte Température Critique : ${payload.temperature.toFixed(1)} °C !`,
          details: payload
        }).save();
      }
    } else if (topic === 'sentinel/alerts/vision') {
      await new Alert({
        type: 'AI_VISION',
        message: `🚨 Alerte IA Vision : ${payload.count || 1} intrus détecté(s) !`,
        details: payload
      }).save();
    } else if (topic === 'sentinel/security/wifi_attempt') {
      // Tentative de connexion Wi-Fi Hotspot remontée par l'ESP8266
      const mac = payload.mac || 'Inconnue';
      const status = payload.status === 'ALLOWED' ? '✅ AUTORISÉE (MAC Whitelisted)' : '🚨 REJETÉE & EXPULSÉE (MAC Non Autorisée)';
      writeSecurityLog(`📶 TENTATIVE WI-FI HOTSPOT -> MAC: ${mac} | Statut: ${status}`);
    }
  } catch (err) {
    console.error('[MQTT Message Error]', err);
  }
});

// ── 3. REST API ENDPOINTS ──

// Route d'authentification du Dashboard (Enregistre chaque tentative)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const rawIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'Inconnue';
  const cleanIP = rawIP.replace('::ffff:', '');

  if (username === 'admin' && password === 'SentinelX2026!') {
    writeSecurityLog(`🔑 TENTATIVE DASHBOARD -> IP: ${cleanIP} | Utilisateur: '${username}' | Statut: ✅ RÉUSSIE`);
    res.json({ success: true, message: 'Authentification réussie' });
  } else {
    writeSecurityLog(`🚨 TENTATIVE DASHBOARD -> IP: ${cleanIP} | Utilisateur testé: '${username}' | Statut: ❌ ÉCHEC (Identifiants invalides)`);
    res.status(401).json({ success: false, message: 'Identifiant ou mot de passe incorrect' });
  }
});

// Obtenir le fichier texte des connexions IP et tentatives
app.get('/api/connections/log', (req, res) => {
  if (fs.existsSync(LOG_FILE_PATH)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(LOG_FILE_PATH);
  } else {
    res.type('text').send("Aucune connexion enregistrée pour le moment.");
  }
});

// Obtenir le dernier état des capteurs
app.get('/api/telemetry/latest', async (req, res) => {
  try {
    const latest = await Telemetry.findOne().sort({ timestamp: -1 });
    res.json(latest || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir l'historique des télémétries
app.get('/api/telemetry/history', async (req, res) => {
  try {
    const history = await Telemetry.find().sort({ timestamp: -1 }).limit(50);
    res.json(history.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir les alertes
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await Alert.find().sort({ timestamp: -1 }).limit(30);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Commande Buzzer
app.post('/api/command/buzzer', (req, res) => {
  const { state } = req.body;
  mqttClient.publish('sentinel/commands', JSON.stringify({ buzzer: !!state }));
  res.json({ status: 'OK', buzzer: !!state });
});

app.listen(PORT, () => {
  console.log(`[Express] Serveur Backend en écoute sur http://localhost:${PORT}`);
});
