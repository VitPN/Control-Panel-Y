Control Panel Y
A Progressive Web App (PWA) interface for controlling an STM32F103 microcontroller via a JDY-33 Bluetooth module using the Web Bluetooth API. 
It supports operation on PCs and Android smartphones, offline caching, and automatic synchronization of settings with non-volatile AT24C32 EEPROM memory.

## 📁 Project Structure

```text
Control-Panel-Y/
├── index.html          # Main PWA layout (clocks, lighting, circuit breakers, chart, terminal)
├── style.css           # Dark theme styling, responsive grid, status highlights, and terminal colors
├── app.js              # Web Bluetooth logic (JDY-33), auto-reconnect, PING timer, RX parser, and chart
├── relay_control.js    # Lighting & Breakers control logic, 20-byte BLE packet chunking, localStorage
├── sun_calendar.js     # Astronomical sunrise/sunset calculation (automatic system timezone detection)
├── sw.js               # Service Worker for offline PWA support and automatic cache updates
├── manifest.json       # Web app manifest for installing on Android/PC home screens
├── chart.umd.min.js    # Local Chart.js library for rendering the temperature history graph
├── icon-192.png        # App icon (192×192 px)
├── icon-512.png        # App icon (512×512 px)
├── deploy.bat          # Automated sw.js cache versioning and GitHub deployment script (Windows)
├── deploy.sh           # Automated sw.js cache versioning and GitHub deployment script (Linux / macOS)
├── README.md           # Project documentation and STM32 communication protocol reference
└── firmware/
    └── main.c          # STM32F103 firmware: UART, RTC, DS18B20, relays, and AT24C32 ring buffer
```

### Key Modules Overview

* **Web Interface (`index.html`, `style.css`)** — builds a responsive dashboard featuring two independent load control blocks (solar/timer lighting and a 2-channel breaker controller with dual daily schedules), a DS18B20 temperature widget, and a live UART/BLE debug console.
* **Communication & Hardware Layer (`app.js`, `relay_control.js`)** — manages the connection to the JDY-33 module via the Web Bluetooth API, splits outgoing commands into 20-byte BLE MTU chunks, handles the smart `PING` keep-alive timer, and persists local user settings in `localStorage`.
* **Astronomical Module (`sun_calendar.js`)** — calculates exact daily sunrise and sunset times using user-defined minute offsets and automatic system timezone detection via `Intl.DateTimeFormat`.
* **PWA & Deployment (`sw.js`, `manifest.json`, `deploy.bat`)** — enables full offline operation and provides one-click cache version bumping when publishing updates to GitHub Pages.
* * *
* **Microcontroller Firmware (`firmware/main.c`)** — parses incoming UART commands, controls relay outputs based on the internal RTC, and records a 24-hour temperature log in non-volatile AT24C32 EEPROM memory.
