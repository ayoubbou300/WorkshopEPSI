// ── SYSTÈME D'AUTHENTIFICATION MOT DE PASSE ──
const AUTH_USER = "admin";
const AUTH_PASS = "SentinelX2026!";

function checkAuthSession() {
    const isAuth = sessionStorage.getItem("sentinel_auth");
    const overlay = document.getElementById("loginOverlay");
    if (isAuth === "true") {
        if (overlay) overlay.style.display = "none";
    } else {
        if (overlay) overlay.style.display = "flex";
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById("loginUser").value.trim();
    const p = document.getElementById("loginPass").value.trim();
    const errDiv = document.getElementById("loginError");

    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            sessionStorage.setItem("sentinel_auth", "true");
            errDiv.style.display = "none";
            document.getElementById("loginOverlay").style.display = "none";
            logEvent("✅ Connexion réussie à la console de supervision.");
        } else {
            errDiv.innerText = data.message || "Identifiant ou mot de passe incorrect !";
            errDiv.style.display = "block";
        }
    } catch (err) {
        if (u === AUTH_USER && p === AUTH_PASS) {
            sessionStorage.setItem("sentinel_auth", "true");
            errDiv.style.display = "none";
            document.getElementById("loginOverlay").style.display = "none";
            logEvent("✅ Connexion réussie à la console de supervision.");
        } else {
            errDiv.innerText = "Identifiant ou mot de passe incorrect !";
            errDiv.style.display = "block";
        }
    }
}

function handleLogout() {
    sessionStorage.removeItem("sentinel_auth");
    document.getElementById("loginOverlay").style.display = "flex";
}

checkAuthSession();

// Configuration Chart.js
const ctx = document.getElementById('telemetryChart').getContext('2d');
const telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Température (°C)',
                borderColor: '#00f0ff',
                backgroundColor: 'rgba(0, 240, 255, 0.1)',
                data: [],
                fill: true,
                tension: 0.3
            },
            {
                label: 'Gaz (MQ-2 raw)',
                borderColor: '#ff9900',
                backgroundColor: 'rgba(255, 153, 0, 0.1)',
                data: [],
                fill: true,
                tension: 0.3
            }
        ]
    },
    options: {
        responsive: true,
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
        },
        plugins: {
            legend: { labels: { color: '#e2e8f0' } }
        }
    }
});

// Helper pour ajouter un événement dans la boîte de log
function logEvent(msg, isAlert = false, timeStr = null) {
    const logBox = document.getElementById('logBox');
    const item = document.createElement('div');
    const time = timeStr || new Date().toLocaleTimeString();
    item.className = `log-item ${isAlert ? 'alert' : 'info'}`;
    item.innerText = `[${time}] ${msg}`;
    logBox.prepend(item);
}

// ── 1. CHARGEMENT DE L'HISTORIQUE DEPUIS MONGODB (VIA BACKEND REST API) ──
const BACKEND_URL = `http://${window.location.hostname || 'localhost'}:3000`;
const btnLog = document.getElementById('btnLogIP');
if (btnLog) btnLog.href = `${BACKEND_URL}/api/connections/log`;

async function loadHistoryFromMongoDB() {
    try {
        logEvent("Chargement de l'historique depuis MongoDB...");
        // Récupérer l'historique des capteurs
        const res = await fetch(`${BACKEND_URL}/api/telemetry/history`);
        if (res.ok) {
            const data = await res.json();
            data.forEach(item => {
                const timeStr = new Date(item.timestamp).toLocaleTimeString();
                telemetryChart.data.labels.push(timeStr);
                telemetryChart.data.datasets[0].data.push(item.temperature);
                telemetryChart.data.datasets[1].data.push(item.gas);
            });
            telemetryChart.update();
            logEvent(`✅ ${data.length} mesures d'historique chargées depuis MongoDB.`);
        }

        // Récupérer l'historique des alertes
        const resAlerts = await fetch(`${BACKEND_URL}/api/alerts`);
        if (resAlerts.ok) {
            const alerts = await resAlerts.json();
            alerts.reverse().forEach(alt => {
                const timeStr = new Date(alt.timestamp).toLocaleTimeString();
                logEvent(alt.message, true, timeStr);
            });
        }
    } catch (err) {
        console.warn("Backend REST API non disponible, mode temps réel seul.", err);
    }
}

// Charger l'historique MongoDB au démarrage
loadHistoryFromMongoDB();

// ── 2. CONNEXION MQTT TEMPS RÉEL VIA WEBSOCKETS (Port 9001) ──
const client = new Paho.MQTT.Client(window.location.hostname || "localhost", 9001, "WebDashboard-" + parseInt(Math.random() * 100, 10));

client.onConnectionLost = function (responseObject) {
    logEvent("Connexion MQTT perdue : " + responseObject.errorMessage, true);
};

client.onMessageArrived = function (message) {
    try {
        const payload = JSON.parse(message.payloadString);
        if (message.destinationName === "sentinel/telemetry") {
            document.getElementById('val-temp').innerText = payload.temperature.toFixed(1) + " °C";
            document.getElementById('val-humi').innerText = Math.round(payload.humidity) + " %";
            document.getElementById('val-gas').innerText = payload.gas + " raw";
            const pirDiv = document.getElementById('val-pir');
            if (payload.motion && pirDiv.innerText !== "INTRUSION DETECTÉE !") {
                logEvent("⚠️ Mouvement détecté par le capteur infrarouge (PIR) !", true);
            }
            pirDiv.innerText = payload.motion ? "INTRUSION DETECTÉE !" : "RAS";
            pirDiv.style.color = payload.motion ? "#ff3366" : "#00ff88";

            // Mise à jour temps réel du graphique
            const timeLabel = new Date().toLocaleTimeString();
            if (telemetryChart.data.labels.length > 25) {
                telemetryChart.data.labels.shift();
                telemetryChart.data.datasets[0].data.shift();
                telemetryChart.data.datasets[1].data.shift();
            }
            telemetryChart.data.labels.push(timeLabel);
            telemetryChart.data.datasets[0].data.push(payload.temperature);
            telemetryChart.data.datasets[1].data.push(payload.gas);
            telemetryChart.update();
        } else if (message.destinationName === "sentinel/alerts/vision") {
            logEvent(`🚨 ALERTE IA VISION : ${payload.count} intrus détecté(s) !`, true);
        }
    } catch (e) {
        console.error("Erreur de parsing MQTT", e);
    }
};

client.connect({
    onSuccess: function () {
        logEvent("Connecté au Broker MQTT Mosquitto via WebSocket.");
        client.subscribe("sentinel/telemetry");
        client.subscribe("sentinel/alerts/vision");
    },
    onFailure: function (err) {
        logEvent("Échec de connexion MQTT : " + err.errorMessage, true);
    }
});

// ── 3. COMMANDES INTERACTIVES ──
function triggerBuzzer(state) {
    // Envoi direct via le Backend API
    fetch(`${BACKEND_URL}/api/command/buzzer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: state })
    }).catch(() => {
        // Fallback direct MQTT
        const message = new Paho.MQTT.Message(JSON.stringify({ buzzer: state }));
        message.destinationName = "sentinel/commands";
        client.send(message);
    });
    logEvent(`Commande envoyée : Buzzer ${state ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
}
