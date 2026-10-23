#pragma once
// ============================================================
//  Cloud.h - WiFi provisioning (captive-portal hotspot) and
//  Firebase Realtime Database sync over HTTPS (REST).
//
//  Runs entirely in its own FreeRTOS task on core 0, so slow
//  network calls can never stall the greenhouse control loop.
// ============================================================
#include <WiFi.h>
#include <WiFiManager.h>        // tzapu/WiFiManager
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>        // v7
#include <Preferences.h>
#include "Config.h"
#include "Secrets.h"

namespace Cloud {

// ---------------- identity ----------------
String deviceId;     // e.g. GH-A1B2C3  (unique per board, derived from the MAC)
String claimCode;    // 6 digits, generated once, shown in the setup portal + Serial
String apName;       // hotspot name, e.g. Greenhouse-A1B2C3

// ---------------- state ----------------
Preferences prefs;
String   idToken;
uint32_t tokenObtainedMs = 0;
uint32_t tokenLifetimeMs = 0;
bool     infoSent = false;
bool     firstPullDone = false;
long long lastModeRev[ACT_COUNT] = {0};
long long lastCfgRev = -1;

WiFiClientSecure dbClient;
HTTPClient       dbHttp;

// ---------------- settings persistence ----------------
void saveSettings(const Settings& s) {
  prefs.begin("gh", false);
  prefs.putBytes("cfg", &s, sizeof(Settings));
  prefs.end();
}

void loadSettings() {
  Settings s;
  prefs.begin("gh", true);
  size_t n = prefs.getBytesLength("cfg");
  if (n == sizeof(Settings)) prefs.getBytes("cfg", &s, sizeof(Settings));
  prefs.end();
  Lock l;
  G.settings = s;
}

// ---------------- identity ----------------
void initIdentity() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[16];
  snprintf(buf, sizeof(buf), "%02X%02X%02X",
           (uint8_t)(mac >> 24), (uint8_t)(mac >> 32), (uint8_t)(mac >> 40));
  deviceId = String("GH-") + buf;
  apName   = String("Greenhouse-") + buf;

  prefs.begin("gh", false);
  claimCode = prefs.getString("claim", "");
  if (claimCode.length() != 6) {
    char c[8];
    snprintf(c, sizeof(c), "%06u", (unsigned)(esp_random() % 1000000UL));
    claimCode = String(c);
    prefs.putString("claim", claimCode);
  }
  prefs.end();
}

// ---------------- WiFi provisioning ----------------
void wipeWifiAndRestart() {
  WiFiManager wm;
  wm.resetSettings();
  Serial.println("WiFi credentials erased. Restarting...");
  delay(500);
  ESP.restart();
}

void connectWifi() {
  WiFiManager wm;
  wm.setDebugOutput(false);
  wm.setTitle("Smart Greenhouse");
  wm.setConnectTimeout(20);          // seconds to try saved network
  wm.setConfigPortalTimeout(180);    // seconds the hotspot stays open
  wm.setAPCallback([](WiFiManager*) {
    Serial.println();
    Serial.println("==============================================");
    Serial.println(" SETUP HOTSPOT OPEN");
    Serial.printf (" 1. Connect your phone to WiFi: %s\n", apName.c_str());
    Serial.printf (" 2. Password: %s\n", PORTAL_AP_PASSWORD);
    Serial.println(" 3. Pick your home / phone-hotspot WiFi in the page that opens");
    Serial.printf (" Device ID: %s   Claim code: %s\n", deviceId.c_str(), claimCode.c_str());
    Serial.println("==============================================");
  });

  char html[320];
  snprintf(html, sizeof(html),
           "<div style='margin:12px 0;padding:10px;border:1px solid #8a8;border-radius:8px'>"
           "<b>Add this greenhouse to your dashboard</b><br>"
           "Device ID: <b>%s</b><br>Claim code: <b>%s</b></div>",
           deviceId.c_str(), claimCode.c_str());
  WiFiManagerParameter info(html);
  wm.addParameter(&info);

  bool ok;
  if (strlen(PORTAL_AP_PASSWORD) >= 8) ok = wm.autoConnect(apName.c_str(), PORTAL_AP_PASSWORD);
  else                                  ok = wm.autoConnect(apName.c_str());

  if (ok) {
    Serial.printf("WiFi connected: %s  IP %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  }
}

// ---------------- Firebase Auth (email/password -> idToken) ----------------
bool tokenValid() {
  return idToken.length() > 0 && (uint32_t)(millis() - tokenObtainedMs) < tokenLifetimeMs;
}

bool signIn() {
  WiFiClientSecure c;
  c.setInsecure();   // see README "Hardening": pin the Google root CA for production
  HTTPClient h;
  h.setTimeout(10000);
  if (!h.begin(c, "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" FIREBASE_API_KEY)) return false;
  h.addHeader("Content-Type", "application/json");

  JsonDocument d;
  d["email"] = FIREBASE_DEVICE_EMAIL;
  d["password"] = FIREBASE_DEVICE_PASSWORD;
  d["returnSecureToken"] = true;
  String body;
  serializeJson(d, body);

  int code = h.POST(body);
  if (code != 200) {
    Serial.printf("[cloud] Firebase sign-in failed (HTTP %d). Check Secrets.h and run 'npm run setup:device'.\n", code);
    h.end();
    return false;
  }
  JsonDocument r;
  DeserializationError err = deserializeJson(r, h.getString());
  h.end();
  if (err) return false;

  idToken = r["idToken"].as<String>();
  uint32_t expires = String(r["expiresIn"] | "3600").toInt();
  if (expires < 600) expires = 600;
  tokenObtainedMs = millis();
  tokenLifetimeMs = (expires - 300) * 1000UL;   // renew 5 min early
  Serial.println("[cloud] Firebase authenticated.");
  return true;
}

// ---------------- Realtime Database REST helper ----------------
int dbRequest(const char* method, const String& path, const String& body, String* out) {
  String url = String("https://") + FIREBASE_DB_HOST + path +
               (path.indexOf('?') >= 0 ? "&" : "?") + "auth=" + idToken;
  dbHttp.setReuse(true);
  dbHttp.setTimeout(8000);
  dbHttp.setConnectTimeout(8000);
  if (!dbHttp.begin(dbClient, url)) return -1;
  dbHttp.addHeader("Content-Type", "application/json");
  int code = dbHttp.sendRequest(method, body);
  if (code > 0 && out) *out = dbHttp.getString();
  dbHttp.end();
  if (code <= 0) dbClient.stop();
  if (code == 401 || code == 403) idToken = "";   // force re-auth
  return code;
}

// ---------------- uplink: device info + telemetry ----------------
bool pushInfo() {
  JsonDocument d;
  d["claimCode"] = claimCode;
  d["fw"] = FW_VERSION;
  d["ip"] = WiFi.localIP().toString();
  d["ssid"] = WiFi.SSID();
  d["mac"] = WiFi.macAddress();
  d["boot"][".sv"] = "timestamp";
  String body;
  serializeJson(d, body);
  return dbRequest("PUT", "/devices/" + deviceId + "/uplink/info.json", body, nullptr) == 200;
}

bool pushTelemetry() {
  SharedState s;
  { Lock l; s = G; }
  if (!s.haveReadings) return true;   // nothing to send yet

  JsonDocument d;
  d["ts"][".sv"] = "timestamp";
  d["temp"]  = round(s.temp * 10.0f) / 10.0f;
  d["hum"]   = round(s.hum * 10.0f) / 10.0f;
  d["soil"]  = s.soilPct;
  d["soilRaw"] = s.soilRaw;
  d["ldr"]   = s.ldr;
  d["lowRaw"]  = s.lowRaw;
  d["highRaw"] = s.highRaw;
  d["tank"]  = TANK_KEYS[s.tank];
  d["soilState"]  = s.soilState;
  d["lightState"] = s.lightState;
  d["highTemp"]   = s.highTemp;
  d["fault"]      = s.sensorFault;
  d["rssi"]  = WiFi.RSSI();
  d["uptime"] = (uint32_t)(millis() / 1000UL);
  d["heap"]  = ESP.getFreeHeap();
  for (int i = 0; i < ACT_COUNT; i++) {
    d["out"][ACT_KEYS[i]]   = s.outputs[i];
    d["mode"][ACT_KEYS[i]]  = MODE_KEYS[s.modes[i]];
    d["lock"][ACT_KEYS[i]]  = s.locked[i];
  }
  String body;
  serializeJson(d, body);
  return dbRequest("PUT", "/devices/" + deviceId + "/uplink/telemetry.json", body, nullptr) == 200;
}

// ---------------- downlink: manual override + settings ----------------
static int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }
static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

bool pullDownlink() {
  String out;
  int code = dbRequest("GET", "/devices/" + deviceId + "/downlink.json", "", &out);
  if (code != 200) return false;

  bool settingsChanged = false;
  Settings toSave;

  if (out != "null") {
    JsonDocument doc;
    if (deserializeJson(doc, out)) return false;

    Lock l;

    // ---- manual override (one revision counter per actuator) ----
    JsonObject ctl = doc["control"];
    for (int i = 0; i < ACT_COUNT; i++) {
      JsonObject c = ctl[ACT_KEYS[i]];
      if (c.isNull()) continue;
      long long rev = c["rev"] | 0LL;
      if (rev != lastModeRev[i]) {
        lastModeRev[i] = rev;
        if (firstPullDone) {   // after a reboot we always start in AUTO; adopt revisions silently
          const char* m = c["mode"] | "auto";
          uint8_t mode = MODE_AUTO;
          if (!strcmp(m, "on")) mode = MODE_ON;
          else if (!strcmp(m, "off")) mode = MODE_OFF;
          G.pendingMode[i] = mode;
          G.pendingFlag[i] = true;
        }
      }
    }

    // ---- settings ----
    JsonObject cfg = doc["config"];
    if (!cfg.isNull()) {
      long long rev = cfg["rev"] | 0LL;
      if (rev != lastCfgRev) {
        lastCfgRev = rev;
        Settings s = G.settings;
        s.tempHigh     = clampf(cfg["tempHigh"]  | s.tempHigh, 15.0f, 60.0f);
        s.tempHyst     = clampf(cfg["tempHyst"]  | s.tempHyst, 0.5f, 10.0f);
        s.ldrBright    = clampi(cfg["ldrBright"] | s.ldrBright, 0, 1022);
        s.ldrDark      = clampi(cfg["ldrDark"]   | s.ldrDark, 1, 1023);
        if (s.ldrDark <= s.ldrBright) s.ldrDark = s.ldrBright + 1;
        s.soilWet      = clampi(cfg["soilWet"]   | s.soilWet, 0, 1000);
        s.soilDry      = clampi(cfg["soilDry"]   | s.soilDry, 50, 1023);
        if (s.soilDry < s.soilWet + 50) s.soilDry = s.soilWet + 50;
        s.tankEmpty    = clampi(cfg["tankEmpty"]   | s.tankEmpty, 0, 1023);
        s.tankFilling  = clampi(cfg["tankFilling"] | s.tankFilling, 0, 1023);
        s.topFull      = clampi(cfg["topFull"]     | s.topFull, 0, 1023);
        s.mistSec      = clampi(cfg["mistSec"]     | (int)s.mistSec, 1, 600);
        s.manualMaxMin = clampi(cfg["manualMaxMin"] | (int)s.manualMaxMin, 0, 240);
        G.settings = s;
        toSave = s;
        settingsChanged = true;
      }
    }
  }

  firstPullDone = true;
  if (settingsChanged) {
    saveSettings(toSave);
    Serial.println("[cloud] New settings received from dashboard.");
  }
  return true;
}

// ---------------- the cloud task ----------------
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    Lock l; G.wifiOk = true;
    return;
  }
  { Lock l; G.wifiOk = false; G.cloudOk = false; }
  infoSent = false;

  // give the ESP32 a moment to auto-reconnect to its saved network first
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) vTaskDelay(500 / portTICK_PERIOD_MS);

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();   // saved network, otherwise opens the setup hotspot (blocks up to 3 min)
  }
  if (WiFi.status() != WL_CONNECTED) vTaskDelay(15000 / portTICK_PERIOD_MS);
}

void cloudTask(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  dbClient.setInsecure();

  uint32_t lastPull = 0, lastPush = 0, lastInfo = 0;

  for (;;) {
    ensureWifi();
    if (WiFi.status() != WL_CONNECTED) continue;

    if (!tokenValid()) {
      if (!signIn()) {
        { Lock l; G.cloudOk = false; }
        vTaskDelay(10000 / portTICK_PERIOD_MS);
        continue;
      }
    }

    uint32_t now = millis();

    if (!infoSent || (uint32_t)(now - lastInfo) > 600000UL) {
      infoSent = pushInfo();
      lastInfo = now;
    }
    if ((uint32_t)(now - lastPull) >= 2000UL) {
      bool ok = pullDownlink();
      lastPull = millis();
      Lock l; G.cloudOk = ok;
    }
    if ((uint32_t)(now - lastPush) >= 5000UL) {
      pushTelemetry();
      lastPush = millis();
    }
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

void begin() {
  initIdentity();
  loadSettings();
  Serial.printf("Device ID: %s   Claim code: %s\n", deviceId.c_str(), claimCode.c_str());
  xTaskCreatePinnedToCore(cloudTask, "cloud", 20480, nullptr, 1, nullptr, 0);
}

}  // namespace Cloud
