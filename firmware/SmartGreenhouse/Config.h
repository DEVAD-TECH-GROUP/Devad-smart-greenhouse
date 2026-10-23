#pragma once
// ============================================================
//  Smart Greenhouse - shared configuration, types and state
// ============================================================
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

#define FW_VERSION "2.0.0"

// ================= TWO SEPARATE I2C BUSES =================
#define SERVO_SDA 18
#define SERVO_SCL 19
#define AHT_SDA   21
#define AHT_SCL   22

// ================= PIN ASSIGNMENTS =================
#define LOW_SENSOR          32
#define HIGH_SENSOR         33
#define SOIL_SENSOR         34
#define REFILL_PUMP_RELAY   25
#define DRIP_PUMP_RELAY     26
#define LDR_PIN             35
#define GROW_LIGHT_RELAY    13
#define BLOWER_FANS_RELAY   14
#define PUMP3_RELAY         27
#define RESET_BUTTON_PIN    0     // BOOT button: hold 5 s to wipe WiFi credentials

// ================= RELAY LOGIC =================
#define FANS_ON    LOW      // active-low
#define FANS_OFF   HIGH
#define PUMP3_ON   HIGH     // active-high
#define PUMP3_OFF  LOW
#define PUMP_ON    LOW      // P1 & P2 active-low
#define PUMP_OFF   HIGH
#define LIGHT_ON   LOW      // active-low
#define LIGHT_OFF  HIGH

// ================= SERVO CALIBRATION =================
#define SERVOMIN 102
#define SERVOMAX 512
#define SERVO_OPEN_ANGLE 90
#define SERVO_STEP_MS    25

// ================= ACTUATORS & MODES =================
enum Act : uint8_t { ACT_FANS = 0, ACT_VENTS, ACT_DRIP, ACT_REFILL, ACT_LIGHT, ACT_MIST, ACT_COUNT };
static const char* const ACT_KEYS[ACT_COUNT] = {"fans", "vents", "drip", "refill", "light", "mist"};

enum Mode : uint8_t { MODE_AUTO = 0, MODE_ON, MODE_OFF };
static const char* const MODE_KEYS[3] = {"auto", "on", "off"};

enum TankState : uint8_t { TANK_IDLE = 0, TANK_FULL, TANK_EMPTY, TANK_PUMPING };
static const char* const TANK_TEXT[4] = {"IDLE", "TANK FULL", "TANK IS EMPTY", "PUMPING IN PROGRESS"};
static const char* const TANK_KEYS[4] = {"idle", "full", "empty", "pumping"};

// ================= TUNABLE SETTINGS (editable from the dashboard) =================
struct Settings {
  float    tempHigh     = 34.0f;  // fans/vents/mist start above this
  float    tempHyst     = 2.0f;   // ...and stop below tempHigh - tempHyst
  int      ldrBright    = 1000;   // below this  -> grow light OFF
  int      ldrDark      = 1020;   // above this  -> grow light ON
  int      soilDry      = 850;    // raw ADC value for 0 % moisture
  int      soilWet      = 300;    // raw ADC value for 100 % moisture
  int      tankEmpty    = 300;    // lower sensor below this -> tank empty
  int      tankFilling  = 400;    // lower sensor above this -> pumping in progress
  int      topFull      = 300;    // upper sensor above this -> tank full
  uint16_t mistSec      = 20;     // pump 3 spray duration
  uint16_t manualMaxMin = 10;     // pumps revert from manual to AUTO after N minutes (0 = never)
};

// ================= STATE SHARED BETWEEN CONTROL LOOP (core 1) AND CLOUD TASK (core 0) =================
struct SharedState {
  // ---- written by control loop, read by cloud task ----
  float   temp = 0, hum = 0;
  int     soilPct = 0, soilRaw = 0, ldr = 0, lowRaw = 0, highRaw = 0;
  bool    outputs[ACT_COUNT] = {false};
  bool    locked[ACT_COUNT]  = {false};        // true when a safety interlock is blocking the actuator
  uint8_t modes[ACT_COUNT]   = {MODE_AUTO};
  uint8_t tank = TANK_IDLE;
  uint8_t soilState = 1;                       // 0 dry, 1 moist, 2 wet
  uint8_t lightState = 1;                      // 0 dark, 1 normal, 2 bright
  bool    highTemp = false;
  bool    sensorFault = false;
  bool    haveReadings = false;

  // ---- written by cloud task, consumed by control loop ----
  Settings settings;
  uint8_t  pendingMode[ACT_COUNT] = {0};
  bool     pendingFlag[ACT_COUNT] = {false};

  // ---- connectivity ----
  bool wifiOk = false, cloudOk = false;
};

extern SharedState G;
extern SemaphoreHandle_t gMutex;

struct Lock {
  Lock()  { xSemaphoreTake(gMutex, portMAX_DELAY); }
  ~Lock() { xSemaphoreGive(gMutex); }
};
