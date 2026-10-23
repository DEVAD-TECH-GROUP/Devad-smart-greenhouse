// ============================================================
//  SMART GREENHOUSE - ESP32 firmware v2
//  - Original 4 automation tasks (temperature, light, soil, tank)
//  - WiFi hotspot provisioning (any user, any network / phone hotspot)
//  - Firebase Realtime Database sync (telemetry up, commands down)
//  - Manual override per actuator: AUTO / ON / OFF, with safety interlocks
//  - Fully non-blocking: automation keeps running with no WiFi
//
//  Libraries (Library Manager):
//    WiFiManager (tzapu) 2.0.17+, ArduinoJson 7.x,
//    Adafruit AHTX0, Adafruit PWM Servo Driver Library
//  Board: "ESP32 Dev Module" (arduino-esp32 core 2.0.x or 3.x)
// ============================================================
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_PWMServoDriver.h>
#include "Config.h"
#include "Cloud.h"

SharedState G;
SemaphoreHandle_t gMutex;

TwoWire I2C_Servo = TwoWire(0);
TwoWire I2C_AHT   = TwoWire(1);
Adafruit_PWMServoDriver pwm(0x40, I2C_Servo);
Adafruit_AHTX0 aht;

bool pwmOk = false, ahtOk = false;

// ---------------- relay table ----------------
const int     RELAY_PIN[ACT_COUNT]      = {BLOWER_FANS_RELAY, -1, DRIP_PUMP_RELAY, REFILL_PUMP_RELAY, GROW_LIGHT_RELAY, PUMP3_RELAY};
const uint8_t RELAY_ON_LEVEL[ACT_COUNT] = {FANS_ON, 0, PUMP_ON, PUMP_ON, LIGHT_ON, PUMP3_ON};

void driveRelay(uint8_t a, bool on) {
  if (RELAY_PIN[a] < 0) return;
  uint8_t level = on ? RELAY_ON_LEVEL[a] : (RELAY_ON_LEVEL[a] == LOW ? HIGH : LOW);
  digitalWrite(RELAY_PIN[a], level);
}

// ---------------- automation state ----------------
bool autoWant[ACT_COUNT]  = {false};   // what AUTO logic wants
bool interlock[ACT_COUNT] = {false};   // safety: true = actuator must stay OFF
uint32_t modeSince[ACT_COUNT] = {0};

bool highTempActive = false;
bool pump3Active = false, pump3Latch = false;
uint32_t pump3StartMs = 0;
bool filling = false;
bool lightAutoOn = false;
float lastGoodTemp = NAN, lastGoodHum = 0;
uint32_t lastAhtRetry = 0;
uint32_t cycleCount = 0;

// ---------------- servos (non-blocking sweep) ----------------
int servoAngle = 0, servoTarget = 0;
uint32_t lastServoStep = 0;

int angleToPulse(int angle) { return map(angle, 0, 180, SERVOMAX, SERVOMIN); }

void writeServos(int angle) {
  int pulse = angleToPulse(angle);
  for (uint8_t ch = 0; ch < 4; ch++) pwm.setPWM(ch, 0, pulse);
}

void servoStep(uint32_t now) {
  if (!pwmOk || servoAngle == servoTarget) return;
  if ((uint32_t)(now - lastServoStep) < SERVO_STEP_MS) return;
  lastServoStep = now;
  servoAngle += (servoTarget > servoAngle) ? 1 : -1;
  writeServos(servoAngle);
}

// ---------------- helpers ----------------
int readAverage(int pin) {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(pin);
    delayMicroseconds(2000);
  }
  return sum / 10;
}

inline bool resolveMode(uint8_t mode, bool autoValue) {
  if (mode == MODE_ON)  return true;
  if (mode == MODE_OFF) return false;
  return autoValue;
}

// ---------------- manual override: apply commands from the cloud ----------------
void applyPending(uint32_t now) {
  Lock l;
  for (int i = 0; i < ACT_COUNT; i++) {
    if (!G.pendingFlag[i]) continue;
    G.pendingFlag[i] = false;
    if (G.modes[i] != G.pendingMode[i]) {
      G.modes[i] = G.pendingMode[i];
      modeSince[i] = now;
      Serial.printf("[override] %s -> %s\n", ACT_KEYS[i], MODE_KEYS[G.modes[i]]);
    }
  }
}

// ---------------- drive outputs (cheap, runs every loop pass) ----------------
void driveOutputs(uint32_t now) {
  // Pump 3 spray timer (auto)
  Settings s;
  { Lock l; s = G.settings; }
  if (pump3Active && (uint32_t)(now - pump3StartMs) >= (uint32_t)s.mistSec * 1000UL) {
    pump3Active = false;
    Serial.println("\n-> Pump 3: spray complete. Pump OFF.");
  }
  autoWant[ACT_MIST] = pump3Active;

  Lock l;
  for (int i = 0; i < ACT_COUNT; i++) {
    // Failsafe: pumps never stay in manual mode forever
    bool isPump = (i == ACT_DRIP || i == ACT_REFILL || i == ACT_MIST);
    if (isPump && G.modes[i] != MODE_AUTO && s.manualMaxMin > 0 &&
        (uint32_t)(now - modeSince[i]) >= (uint32_t)s.manualMaxMin * 60000UL) {
      G.modes[i] = MODE_AUTO;
      modeSince[i] = now;
      Serial.printf("[override] %s manual timeout -> AUTO\n", ACT_KEYS[i]);
    }

    bool want = resolveMode(G.modes[i], autoWant[i]);
    bool blocked = want && interlock[i];
    if (blocked) want = false;
    G.locked[i]  = blocked;
    G.outputs[i] = want;

    if (i == ACT_VENTS) servoTarget = want ? SERVO_OPEN_ANGLE : 0;
    else                driveRelay(i, want);
  }
}

// ---------------- sensing + AUTO decisions (runs once per second) ----------------
void sensorCycle(uint32_t now) {
  Settings s;
  { Lock l; s = G.settings; }

  int lowRaw  = readAverage(LOW_SENSOR);
  int highRaw = readAverage(HIGH_SENSOR);
  int soilRaw = readAverage(SOIL_SENSOR);
  int ldr     = readAverage(LDR_PIN);

  // ---- temperature / humidity ----
  bool fault = true;
  if (ahtOk) {
    sensors_event_t humidity, temp;
    if (aht.getEvent(&humidity, &temp)) {
      float t = temp.temperature;
      if (!isnan(t) && t > -40.0f && t < 85.0f) {
        lastGoodTemp = t;
        lastGoodHum = humidity.relative_humidity;
        fault = false;
      }
    }
  }
  if (fault && (uint32_t)(now - lastAhtRetry) > 10000UL) {
    lastAhtRetry = now;
    ahtOk = aht.begin(&I2C_AHT);
  }

  // ---- TASK 1: TEMPERATURE CONTROL ----
  if (!isnan(lastGoodTemp) && !fault) {
    if (lastGoodTemp > s.tempHigh && !highTempActive) {
      highTempActive = true;
      if (!pump3Latch) {
        pump3StartMs = now;
        pump3Active = true;
        pump3Latch = true;
      }
    } else if (highTempActive && lastGoodTemp < (s.tempHigh - s.tempHyst)) {
      highTempActive = false;
      pump3Latch = false;
    }
  }
  autoWant[ACT_FANS]  = highTempActive;
  autoWant[ACT_VENTS] = highTempActive;

  // ---- TASK 4: WATER LEVEL ----
  bool tankIsEmpty     = (lowRaw < s.tankEmpty);
  bool pumpingProgress = (lowRaw > s.tankFilling);
  bool highIsFull      = (highRaw > s.topFull);

  if (tankIsEmpty) filling = true;
  if (highIsFull)  filling = false;

  uint8_t tank;
  if (highIsFull)           tank = TANK_FULL;
  else if (tankIsEmpty)     tank = TANK_EMPTY;
  else if (pumpingProgress) tank = TANK_PUMPING;
  else                      tank = TANK_IDLE;

  autoWant[ACT_REFILL]  = filling;
  interlock[ACT_REFILL] = highIsFull;      // never pump into a full tank, even manually

  // ---- TASK 3: SOIL MOISTURE ----
  int soilPct = map(soilRaw, s.soilDry, s.soilWet, 0, 100);
  soilPct = constrain(soilPct, 0, 100);
  uint8_t soilState = (soilPct < 30) ? 0 : (soilPct < 70 ? 1 : 2);

  bool dripAuto = true;
  if (tank == TANK_EMPTY) dripAuto = false;
  else if (soilState == 2) dripAuto = false;
  autoWant[ACT_DRIP]  = dripAuto;
  interlock[ACT_DRIP] = (tank == TANK_EMPTY);   // dry-run protection, even manually

  // ---- TASK 2: LIGHT CONTROL ----
  uint8_t lightState = 1;
  if (ldr > s.ldrDark)        { lightAutoOn = true;  lightState = 0; }
  else if (ldr < s.ldrBright) { lightAutoOn = false; lightState = 2; }
  autoWant[ACT_LIGHT] = lightAutoOn;

  // ---- publish readings to shared state ----
  {
    Lock l;
    G.temp = isnan(lastGoodTemp) ? 0 : lastGoodTemp;
    G.hum = lastGoodHum;
    G.soilPct = soilPct; G.soilRaw = soilRaw;
    G.ldr = ldr; G.lowRaw = lowRaw; G.highRaw = highRaw;
    G.tank = tank; G.soilState = soilState; G.lightState = lightState;
    G.highTemp = highTempActive;
    G.sensorFault = fault;
    G.haveReadings = true;
  }

  // ---- serial table every 3rd cycle (same layout as v1) ----
  cycleCount++;
  if (cycleCount % 3 == 0) {
    SharedState v;
    { Lock l; v = G; }
    const char* tempState = highTempActive ? "HIGH" : "NORMAL";
    const char* coolAct   = highTempActive ? "FANS ON" : "OFF";
    const char* ldrState  = lightState == 0 ? "DARK" : (lightState == 2 ? "BRIGHT" : "NORMAL");
    const char* soilTxt   = soilState == 0 ? "DRY" : (soilState == 1 ? "MOIST" : "WET");
    char soilDisplay[24];
    snprintf(soilDisplay, sizeof(soilDisplay), "%s (%d%%)", soilTxt, soilPct);

    Serial.println("| SENSOR       | RAW VAL | STATE                 | ACTION       |");
    Serial.println("|--------------|---------|-----------------------|--------------|");
    Serial.printf("| TEMP (AHT20)| %7.2f | %-21s | %-12s |\n", v.temp, fault ? "SENSOR FAULT" : tempState, coolAct);
    Serial.printf("| LDR          | %7d | %-21s | %-12s |\n", ldr, ldrState, v.outputs[ACT_LIGHT] ? "LIGHT ON" : "LIGHT OFF");
    Serial.printf("| SOIL         | %7d | %-21s | %-12s |\n", soilRaw, soilDisplay, v.outputs[ACT_DRIP] ? "P2 ON" : "P2 OFF");
    Serial.printf("| LOWER (WLS1) | %7d | %-21s | %-12s |\n", lowRaw, TANK_TEXT[tank], v.outputs[ACT_REFILL] ? "P1 ON" : "P1 OFF");
    Serial.printf("| UPPER (WLS2) | %7d | %-21s | %-12s |\n", highRaw, highIsFull ? "TANK FULL" : "NOT FULL", "-");
    Serial.printf("| PUMP 3       |   ---   | %-21s | %-12s |\n", v.outputs[ACT_MIST] ? "ACTIVE" : "IDLE", v.outputs[ACT_MIST] ? "SPRAYING" : "OFF");
    Serial.printf("| WIFI %-7s| CLOUD %-6s | modes: ", v.wifiOk ? "ok" : "offline", v.cloudOk ? "ok" : "offline");
    for (int i = 0; i < ACT_COUNT; i++) Serial.printf("%s=%s ", ACT_KEYS[i], MODE_KEYS[v.modes[i]]);
    Serial.println();
    Serial.println("|--------------|---------|-----------------------|--------------|\n");
  }
}

// ---------------- hold BOOT 5 s to reset WiFi ----------------
void handleResetButton(uint32_t now) {
  static uint32_t pressedAt = 0;
  if (digitalRead(RESET_BUTTON_PIN) == LOW) {
    if (pressedAt == 0) pressedAt = now;
    if ((uint32_t)(now - pressedAt) > 5000UL) Cloud::wipeWifiAndRestart();
  } else {
    pressedAt = 0;
  }
}

// ================= SETUP =================
void setup() {
  // Force ALL relays OFF before setting them as outputs (boot fix)
  for (int i = 0; i < ACT_COUNT; i++) {
    if (RELAY_PIN[i] < 0) continue;
    driveRelay(i, false);
    pinMode(RELAY_PIN[i], OUTPUT);
    driveRelay(i, false);
  }
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

  Serial.begin(115200);
  delay(500);

  gMutex = xSemaphoreCreateMutex();

  I2C_Servo.begin(SERVO_SDA, SERVO_SCL);
  I2C_AHT.begin(AHT_SDA, AHT_SCL);

  analogReadResolution(10);
  analogSetAttenuation(ADC_11db);
  pinMode(LOW_SENSOR, INPUT);
  pinMode(HIGH_SENSOR, INPUT);
  pinMode(SOIL_SENSOR, INPUT);
  pinMode(LDR_PIN, INPUT);

  // PCA9685 servo driver (probe so a missing board can't hang the greenhouse)
  I2C_Servo.beginTransmission(0x40);
  pwmOk = (I2C_Servo.endTransmission() == 0);
  if (pwmOk) {
    pwm.begin();
    pwm.setPWMFreq(50);
    writeServos(0);                       // close all vents at startup
  } else {
    Serial.println("WARNING: PCA9685 not found - vents disabled.");
  }

  ahtOk = aht.begin(&I2C_AHT);
  if (!ahtOk) Serial.println("WARNING: AHT20 not found - will keep retrying.");

  Serial.println("\n==============================================");
  Serial.println("SMART GREENHOUSE v" FW_VERSION ": ALL SYSTEMS READY");
  Serial.println("==============================================");

  Cloud::begin();   // WiFi hotspot + Firebase run in their own task from here
}

// ================= MAIN LOOP =================
void loop() {
  static uint32_t lastCycle = 0;
  uint32_t now = millis();

  handleResetButton(now);
  applyPending(now);

  if (lastCycle == 0 || (uint32_t)(now - lastCycle) >= 1000UL) {
    lastCycle = now;
    sensorCycle(now);
  }

  driveOutputs(now);
  servoStep(millis());
  delay(10);
}
