# Smart Greenhouse: ESP32 + Firebase + Node.js + MongoDB + React

```
ESP32 firmware  <--HTTPS-->  Firebase Realtime DB  <--Admin SDK-->  Node.js API  <--REST/WebSocket-->  React dashboard
(sensors, relays)            (device data plane)                    (auth, rules)                      (Vite, live UI)
                                                                         |
                                                                      MongoDB (users, devices, history, activity)
```

| Layer | Stores | Why |
|---|---|---|
| Firebase RTDB | live telemetry, commands, settings | the firmware's database, tiny HTTPS calls |
| MongoDB | users, sessions, devices, history, activity log | the backend's database |

Dashboard users never touch Firebase. They talk to your Node API, which checks ownership and then reads/writes Firebase with the Admin SDK.

## 1. Firebase (10 min)

1. Create a project at console.firebase.google.com.
2. **Build > Realtime Database > Create database.** Note the URL.
3. **Build > Authentication > Get started > Email/Password: enable.**
4. **Realtime Database > Rules:** paste `firebase/database.rules.json` and publish.
5. **Project settings > Service accounts > Generate new private key.** Save as `server/serviceAccountKey.json`.
6. **Project settings > General:** copy the **Web API Key** (for the firmware).

## 2. Backend

```bash
cd server
cp .env.example .env        # fill in MongoDB URI, JWT secret, Firebase DB URL, device email/password
npm install
npm run setup:device        # creates the firmware's Firebase account + `device` claim
npm run dev                 # http://localhost:4000
```

MongoDB: local (`mongodb://127.0.0.1:27017/smart-greenhouse`) or a free Atlas cluster.

## 3. Dashboard

```bash
cd client
npm install
npm run dev                 # http://localhost:5173  (proxies /api and websockets to :4000)
```

Production: `npm run build` in `client/`, then run the server with `NODE_ENV=production`. It serves `client/dist` itself on one origin.

## 4. Firmware

1. Arduino IDE > Library Manager, install: **WiFiManager** (tzapu), **ArduinoJson 7**, **Adafruit AHTX0**, **Adafruit PWM Servo Driver Library**.
2. Open `firmware/SmartGreenhouse/SmartGreenhouse.ino`.
3. Edit `Secrets.h`: Web API Key, database host, and the same device email/password as `server/.env`.
4. Board **ESP32 Dev Module**, upload, open Serial Monitor at 115200.

### Connecting any user's WiFi (hotspot provisioning)
- No saved WiFi: the ESP32 opens a hotspot **Greenhouse-XXXXXX** (password from `Secrets.h`).
- Join it on a phone; a setup page opens. Pick a home WiFi **or your phone's hotspot**, enter its password.
- The page also shows the **Device ID** and **claim code**.
- Hold the **BOOT** button for 5 s to erase WiFi and start over. If the network disappears for a while, the hotspot reopens automatically.

### Linking it to an account
Register in the dashboard > **Add greenhouse** > enter Device ID + claim code. The backend verifies the code against what the device published to Firebase, so only someone who saw the device's setup page can claim it.

## Manual override
Every actuator (fans, vents, mist, drip, refill, light) has **Auto / On / Off** in the dashboard. Details:
- Commands reach the device in about 2 s; the UI shows a spinner until the device confirms.
- After a reboot everything starts in **Auto**; stale commands are never replayed.
- **Safety locks apply even in manual:** drip never runs with an empty tank, refill never runs into a full tank.
- Pumps forced On revert to Auto after `manualMaxMin` minutes (default 10, configurable).
- Commands are rejected while the device is offline.

## What changed in the firmware vs. your original sketch
- Same thresholds and same four automation tasks, same Serial table.
- Fully non-blocking: no more `delay(3000)` or blocking servo sweeps, so commands stay responsive. Servos sweep step by step.
- Cloud work runs in a separate FreeRTOS task on core 0. With no WiFi, automation continues.
- A missing AHT20 or PCA9685 no longer hangs the board in `while(1)`. It reports a sensor fault and retries.
- An invalid temperature no longer becomes `0.0`. The last good value is held and `fault` is reported.
- Thresholds are editable from the dashboard and persist in flash.
- One behavior kept as-is from your code: drip runs whenever soil is not WET (including MOIST).

## Firebase data model
```
devices/{id}/uplink/info        claimCode, fw, ip, ssid, mac, boot
devices/{id}/uplink/telemetry   temp, hum, soil, ldr, tank, out{}, mode{}, lock{}, rssi, ts ...
devices/{id}/downlink/control/{actuator}   { mode: auto|on|off, rev }
devices/{id}/downlink/config               thresholds + rev
```

## Security notes
- Passwords: bcrypt (cost 12). Sessions: 15-min access JWT in memory + rotating refresh token in an httpOnly cookie, stored hashed in MongoDB. Changing your password signs out other devices.
- Rate limits on login/register/claim, Helmet headers, zod validation on every route, ownership checks on every device route.
- **Firmware TLS uses `setInsecure()`** (no certificate pinning) to keep setup simple. For production, pin the Google root CA.
- **All devices share one Firebase device account.** The database rules only let it touch `uplink`/`downlink`, but one compromised device could read another device's data. For stricter isolation, mint per-device custom tokens.
- Never commit `Secrets.h`, `.env` or `serviceAccountKey.json`.

## Not included (easy next steps)
Password-reset email, sharing a greenhouse between users, push/email alerts, OTA firmware updates.

## Honest status
I could not compile the firmware or run `npm install`/`vite build` in my sandbox (no hardware, no network). The server and client sources pass syntax checks, but expect to fix a small thing or two on first run, especially the firmware against your exact library versions. Send me any compiler or runtime error and I'll patch it.
# Devad-smart-greenhouse
