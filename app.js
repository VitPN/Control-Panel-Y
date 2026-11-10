const JDY33_SERVICE_UUID = 0xFFE0;
const JDY33_CHAR_UUID = 0xFFE1;

const ENABLE_ERROR_TOASTS = false; // true — показывать ошибки, false — скрыть ошибки

let bluetoothDevice = null;
let dataCharacteristic = null;
let receivedBuffer = "";
let currentMcuTimeStr = "--:--:--";
let isSyncConfirmed = false;

let offsetLightOff = parseInt(localStorage.getItem('offset_light_off')) || 0;
let offsetLightOn = parseInt(localStorage.getItem('offset_light_on')) || 0;

// === РЕГИСТРАЦИЯ SERVICE WORKER ДЛЯ PWA ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('Service Worker не зарегистрирован:', err);
        });
    });

    // Автоматически перезагружаем страницу, когда новый Service Worker вступает в силу
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

// === ВСПЛЫВАЮЩИЕ УВЕДОМЛЕНИЯ (TOAST) ===
let toastTimeout = null;
window.showToast = function(message, isError = false) {
    
    // Если показ ошибок на экране отключён — пишем её в консоль браузера и выходим
    if (isError && !ENABLE_ERROR_TOASTS) {
        console.warn('[STM32 Error]:', message);
        return;
    }
    
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.textContent = message;
    toast.className = isError ? 'toast error' : 'toast';

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
};

// === ЧАСЫ И ВИДЖЕТЫ СОЛНЦА ===
function updatePCClock() {
    const now = new Date();
    document.getElementById('pc-time').textContent = now.toLocaleTimeString('ru-RU', { hour12: false });
    document.getElementById('pc-date').textContent = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
setInterval(updatePCClock, 1000);
updatePCClock();

function updateSunWidgets() {
    if (typeof window.calculateBrestSunTimings === 'function') {
        const timings = window.calculateBrestSunTimings(offsetLightOff, offsetLightOn);
        document.getElementById('sunrise-time').textContent = timings.sunrise;
        document.getElementById('sunset-time').textContent = timings.sunset;
        document.getElementById('light-off-time').textContent = "Выкл. света: " + timings.lightOff;
        document.getElementById('light-on-time').textContent = "Вкл. света: " + timings.lightOn;
    }
}

function initSunWidgetsOnLoad() {
    const signOff = offsetLightOff >= 0 ? '+' : '';
    const offEl = document.getElementById('offset-off-text');
    if (offEl) offEl.textContent = `(${signOff}${String(offsetLightOff).padStart(2, '0')} мин)`;

    const signOn = offsetLightOn >= 0 ? '+' : '';
    const onEl = document.getElementById('offset-on-text');
    if (onEl) onEl.textContent = `(${signOn}${String(offsetLightOn).padStart(2, '0')} мин)`;

    updateSunWidgets();
}

window.adjustOffset = function(type, value) {
    if (type === 'off') {
        offsetLightOff = Math.max(-120, Math.min(120, offsetLightOff + value));
        const sign = offsetLightOff >= 0 ? '+' : '';
        document.getElementById('offset-off-text').textContent = `(${sign}${String(offsetLightOff).padStart(2, '0')} мин)`;
        localStorage.setItem('offset_light_off', offsetLightOff);
    } else if (type === 'on') {
        offsetLightOn = Math.max(-120, Math.min(120, offsetLightOn + value));
        const sign = offsetLightOn >= 0 ? '+' : '';
        document.getElementById('offset-on-text').textContent = `(${sign}${String(offsetLightOn).padStart(2, '0')} мин)`;
        localStorage.setItem('offset_light_on', offsetLightOn);
    }
    updateSunWidgets();
};

setInterval(updateSunWidgets, 3600000);
initSunWidgetsOnLoad();

// === ГРАФИК И КОЛЬЦЕВОЙ БУФЕР ТЕМПЕРАТУРЫ ===
const MAX_CHART_POINTS = 30;
const MAX_HISTORY_POINTS = 50000;

let fullHistoryLabels = [];
let fullHistoryData = [];
let saveCounter = 0;

try {
    const localLabels = localStorage.getItem('temp_chart_labels');
    const localData = localStorage.getItem('temp_chart_data');
    if (localLabels && localData) {
        fullHistoryLabels = JSON.parse(localLabels);
        fullHistoryData = JSON.parse(localData);
    }
} catch (e) {
    console.error("Ошибка чтения архива из localStorage:", e);
}

function saveRingBufferToStorage() {
    try {
        localStorage.setItem('temp_chart_labels', JSON.stringify(fullHistoryLabels));
        localStorage.setItem('temp_chart_data', JSON.stringify(fullHistoryData));
    } catch (e) {
        const cutCount = Math.floor(fullHistoryLabels.length * 0.2);
        fullHistoryLabels.splice(0, cutCount);
        fullHistoryData.splice(0, cutCount);
    }
}
window.addEventListener('beforeunload', saveRingBufferToStorage);

const ctx = document.getElementById('tempChart').getContext('2d');
const tempChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: fullHistoryLabels.slice(-MAX_CHART_POINTS),
        datasets: [{
            label: '°C',
            data: fullHistoryData.slice(-MAX_CHART_POINTS),
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            pointRadius: 2,
            pointHoverRadius: 6
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45 }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: {
                    color: '#94a3b8',
                    stepSize: 1,
                    callback: (value) => value + '°C'
                }
            }
        }
    }
});

function addDataToChart(timeLabel, tempValue) {
    if (!timeLabel || timeLabel === "--:--:--") return;

    if (fullHistoryLabels.length >= MAX_HISTORY_POINTS) {
        fullHistoryLabels.shift();
        fullHistoryData.shift();
    }
    fullHistoryLabels.push(timeLabel);
    fullHistoryData.push(tempValue);

    if (tempChart.data.labels.length >= MAX_CHART_POINTS) {
        tempChart.data.labels.shift();
        tempChart.data.datasets[0].data.shift();
    }
    tempChart.data.labels.push(timeLabel);
    tempChart.data.datasets[0].data.push(tempValue);
    tempChart.update();

    saveCounter++;
    if (saveCounter >= 5) {
        saveCounter = 0;
        saveRingBufferToStorage();
    }
}

// === BLUETOOTH И ОБМЕН ДАННЫМИ ===
const btnConnect = document.getElementById('btn-connect');
const btnSync = document.getElementById('btn-sync');
const statusText = document.getElementById('status-text');
const tempOut = document.getElementById('temp-out');

function setStatus(type, message) {
    statusText.className = "status";
    if (type === "OK") statusText.classList.add("connected");
    if (type === "ERR") statusText.classList.add("error");
    statusText.textContent = message;
}

function requestInitialMcuState() {
    setTimeout(async () => {
        if (!dataCharacteristic) return;
        try {
            const encoder = new TextEncoder();
            
            const statusCmd = encoder.encode("GET_STATUS\n");
            if (dataCharacteristic.writeValueWithResponse) {
                await dataCharacteristic.writeValueWithResponse(statusCmd);
            } else {
                await dataCharacteristic.writeValue(statusCmd);
            }

            await new Promise(r => setTimeout(r, 100));

            const offsetsCmd = encoder.encode("GET_OFFSETS\n");
            if (dataCharacteristic.writeValueWithResponse) {
                await dataCharacteristic.writeValueWithResponse(offsetsCmd);
            } else {
                await dataCharacteristic.writeValue(offsetsCmd);
            }

            // Страховка: если через 3 секунды статус всё ещё в ожидании — снимаем мигание
            setTimeout(() => {
                const relayLabel = document.getElementById('relay-state-label');
                if (relayLabel && relayLabel.classList.contains('status-pending')) {
                    relayLabel.textContent = "НЕТ ОТВЕТА ОТ МК";
                    relayLabel.className = "status-offline";
                }
            }, 3000);

        } catch (err) {
            console.error("Ошибка запроса начального состояния МК:", err);
        }
    }, 400);
}

btnConnect.addEventListener('click', async () => {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
        return;
    }

    try {
        setStatus("NORM", "Поиск устройства...");
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ services: [JDY33_SERVICE_UUID] }]
        });

        setStatus("NORM", "Соединение...");
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

        const server = await bluetoothDevice.gatt.connect();
        const service = await server.getPrimaryService(JDY33_SERVICE_UUID);
        dataCharacteristic = await service.getCharacteristic(JDY33_CHAR_UUID);

        await dataCharacteristic.startNotifications();
        dataCharacteristic.addEventListener('characteristicvaluechanged', handleIncomingData);

        setStatus("OK", "Подключено");
        btnConnect.textContent = "Отключить";
        btnConnect.className = "connect-btn connected";
        btnSync.disabled = false;

                setStatus("OK", "Подключено");
        btnConnect.textContent = "Отключить";
        btnConnect.className = "connect-btn connected";
        btnSync.disabled = false;

        // Показываем нейтральный статус ожидания ответа от STM32
        const relayLabel = document.getElementById('relay-state-label');
        if (relayLabel) {
            relayLabel.textContent = "ЗАПРОС СОСТОЯНИЯ...";
            relayLabel.className = "status-pending";
        }

        if (typeof window.setRelayControlsDisabled === 'function') {
            window.setRelayControlsDisabled(false);
        }

        requestInitialMcuState();

    } catch (error) {
        console.error(error);
        setStatus("ERR", "Ошибка связи");
        onDisconnected();
    }
});

// === ВЫГРУЗКА АРХИВА ИЗ EEPROM STM32 ===
let eepromLogBuffer = [];
let isDownloadingEeprom = false;
let eepromDownloadTimeout = null;

function resetEepromDownloadState(message = null, isError = false) {
    isDownloadingEeprom = false;
    if (eepromDownloadTimeout) {
        clearTimeout(eepromDownloadTimeout);
        eepromDownloadTimeout = null;
    }
    const btn = document.getElementById('btn-sync-eeprom');
    if (btn) {
        btn.disabled = false;
        btn.textContent = "💾 Архив МК";
    }
    if (message) {
        window.showToast(message, isError);
    }
}

const btnSyncEeprom = document.getElementById('btn-sync-eeprom');
if (btnSyncEeprom) {
    btnSyncEeprom.addEventListener('click', async () => {
        if (!dataCharacteristic) {
            window.showToast('Нет связи с STM32', true);
            return;
        }

        eepromLogBuffer = [];
        isDownloadingEeprom = true;
        btnSyncEeprom.disabled = true;
        btnSyncEeprom.textContent = "⏳ Чтение...";

        if (eepromDownloadTimeout) clearTimeout(eepromDownloadTimeout);
        eepromDownloadTimeout = setTimeout(() => {
            if (isDownloadingEeprom) {
                resetEepromDownloadState('Таймаут: STM32 не ответил на запрос архива', true);
            }
        }, 5000);

        try {
            const encoder = new TextEncoder();
            const cmd = encoder.encode("GET_LOGS\n");
            if (dataCharacteristic.writeValueWithResponse) {
                await dataCharacteristic.writeValueWithResponse(cmd);
            } else {
                await dataCharacteristic.writeValue(cmd);
            }
        } catch (err) {
            resetEepromDownloadState('Ошибка отправки команды чтения архива', true);
        }
    });
}

// === ПРИЁМ ДАННЫХ ОТ STM32 ===
function handleIncomingData(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    receivedBuffer += decoder.decode(value);

    let lineEndIndex;
    while ((lineEndIndex = receivedBuffer.indexOf('\n')) >= 0) {
        const line = receivedBuffer.substring(0, lineEndIndex).trim();
        receivedBuffer = receivedBuffer.substring(lineEndIndex + 1);

        if (line.startsWith("CRC_ERR") || line.includes("Error")) {
            window.showToast(line, true);
        }

        if (line === "SYNC_OK") {
            isSyncConfirmed = true;
            
            btnSync.textContent = "Синхронизировано!";
            btnSync.classList.remove('sync-success-animate');
            void btnSync.offsetWidth;
            btnSync.classList.add('sync-success-animate');

           // setTimeout(() => {  // это деёствие обрабатываем в btnsinc
           //     btnSync.classList.remove('sync-success-animate');
           //     btnSync.textContent = "Синхронизировать время";
           // }, 1500);
        }
        else if (line.startsWith("A:")) {
            const mcuDateString = line.replace("A:", "").trim();
            if (/^\d{2}\.\d{2}\.\d{4}$/.test(mcuDateString)) {
                document.getElementById('mcu-date').textContent = mcuDateString;
            }
        }
        else if (line.startsWith("D:")) {
            const mcuTimeString = line.replace("D:", "").trim();
            if (/^\d{2}\.\d{2}\.\d{2}$/.test(mcuTimeString)) {
                currentMcuTimeStr = mcuTimeString;
                document.getElementById('mcu-time').textContent = mcuTimeString;
            }
        }
        else if (line.startsWith("T:")) {
            const tempValue = parseFloat(line.replace("T:", ""));
            if (!isNaN(tempValue)) {
                tempOut.textContent = tempValue.toFixed(1) + "°C";
                addDataToChart(currentMcuTimeStr, tempValue);

                tempOut.classList.remove('pulse-active');
                void tempOut.offsetWidth;
                tempOut.classList.add('pulse-active');
            }
        }
        else if (line.startsWith("STATUS:")) {
            const statusStr = line.replace("STATUS:", "").trim();
            if (typeof window.syncRelayStatusFromMCU === 'function') {
                window.syncRelayStatusFromMCU(statusStr);
            }
        }
        else if (line.startsWith("OFFSETS:")) {
            const parts = line.replace("OFFSETS:", "").trim().split(".");
            if (parts.length === 2) {
                const mcuOff = parseInt(parts[0], 10);
                const mcuOn = parseInt(parts[1], 10);

                if (!isNaN(mcuOff) && !isNaN(mcuOn)) {
                    offsetLightOff = mcuOff;
                    offsetLightOn = mcuOn;
                    localStorage.setItem('offset_light_off', offsetLightOff);
                    localStorage.setItem('offset_light_on', offsetLightOn);
                    initSunWidgetsOnLoad();
                }
            }
        }
        else if (line === "LOG_START" && isDownloadingEeprom) {
            if (eepromDownloadTimeout) clearTimeout(eepromDownloadTimeout);
            eepromDownloadTimeout = setTimeout(() => {
                if (isDownloadingEeprom) {
                    resetEepromDownloadState('Обрыв выгрузки архива из EEPROM', true);
                }
            }, 15000);
        }
        else if (line === "LOG_EMPTY") {
            resetEepromDownloadState('Архив в памяти STM32 пуст', true);
        }
        else if (line.startsWith("LOG:") && isDownloadingEeprom) {
            eepromLogBuffer.push(line.replace("LOG:", "").trim());
        }
        else if (line === "LOG_END" && isDownloadingEeprom) {
            const count = eepromLogBuffer.length;
            resetEepromDownloadState(count > 0 ? `Архив загружен (${count} точек)` : 'Архив пуст');

            if (count === 0) return;

            let csvContent = "\uFEFFДата и время;Температура (°C)\n";
            const parsedLabels = [];
            const parsedValues = [];

            eepromLogBuffer.forEach(item => {
                const [dt, temp] = item.split(";");
                const numTemp = parseFloat(temp);
                if (dt && !isNaN(numTemp)) {
                    csvContent += `${dt};${String(temp).replace('.', ',')}\n`;
                    parsedLabels.push(dt);
                    parsedValues.push(numTemp);
                }
            });

            fullHistoryLabels = parsedLabels.slice(-MAX_HISTORY_POINTS);
            fullHistoryData = parsedValues.slice(-MAX_HISTORY_POINTS);
            saveRingBufferToStorage();

            tempChart.data.labels = fullHistoryLabels.slice(-MAX_CHART_POINTS);
            tempChart.data.datasets[0].data = fullHistoryData.slice(-MAX_CHART_POINTS);
            tempChart.update();

            downloadCsvBlob(csvContent, `stm32_eeprom_log_${new Date().toISOString().slice(0, 10)}.csv`);
        }
    }
}

// === МОДАЛЬНОЕ ОКНО И СИНХРОНИЗАЦИЯ ===
function showSyncConfirmModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('sync-confirm-modal');
        const btnOk = document.getElementById('btn-modal-confirm');
        const btnCancel = document.getElementById('btn-modal-cancel');

        if (!modal || !btnOk || !btnCancel) {
            resolve(true);
            return;
        }

        document.getElementById('modal-light-off-val').textContent =
            document.getElementById('light-off-time')?.textContent || 'Выкл. света: --:--';
        document.getElementById('modal-offset-off-val').textContent =
            document.getElementById('offset-off-text')?.textContent || '(+00 мин)';

        document.getElementById('modal-light-on-val').textContent =
            document.getElementById('light-on-time')?.textContent || 'Вкл. света: --:--';
        document.getElementById('modal-offset-on-val').textContent =
            document.getElementById('offset-on-text')?.textContent || '(+00 мин)';

        modal.classList.remove('hidden');

        const cleanup = (result) => {
            modal.classList.add('hidden');
            btnOk.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdropClick);
            document.removeEventListener('keydown', onEscKey);
            resolve(result);
        };

        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdropClick = (e) => { if (e.target === modal) cleanup(false); };
        const onEscKey = (e) => { if (e.key === 'Escape') cleanup(false); };

        btnOk.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdropClick);
        document.addEventListener('keydown', onEscKey);
    });
}

btnSync.addEventListener('click', async () => {
    if (!dataCharacteristic) return;

    const isConfirmed = await showSyncConfirmModal();
    if (!isConfirmed) return;

    try {
        btnSync.disabled = true;
        isSyncConfirmed = false;
        btnSync.textContent = "Синхронизация...";

        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const sec = String(now.getSeconds()).padStart(2, '0');
        const timeCmd = `TIME:${hrs}.${min}.${sec}\n`;

        const day = String(now.getDate()).padStart(2, '0');
        const mon = String(now.getMonth() + 1).padStart(2, '0');
        const yr = now.getFullYear();
        const dateCmd = `DATE:${day}.${mon}.${yr}\n`;

        const offsetsCmd = `OFFSETS:${offsetLightOff}.${offsetLightOn}\n`;
        const encoder = new TextEncoder();

        if (dataCharacteristic.writeValueWithResponse) {
            await dataCharacteristic.writeValueWithResponse(encoder.encode(timeCmd));
            await new Promise(r => setTimeout(r, 60));
            await dataCharacteristic.writeValueWithResponse(encoder.encode(dateCmd));
            await new Promise(r => setTimeout(r, 60));
            await dataCharacteristic.writeValueWithResponse(encoder.encode(offsetsCmd));
        } else {
            await dataCharacteristic.writeValue(encoder.encode(timeCmd));
            await new Promise(r => setTimeout(r, 60));
            await dataCharacteristic.writeValue(encoder.encode(dateCmd));
            await new Promise(r => setTimeout(r, 60));
            await dataCharacteristic.writeValue(encoder.encode(offsetsCmd));
        }

        setTimeout(() => {
            if (bluetoothDevice && bluetoothDevice.gatt.connected) {
                btnSync.disabled = false;
                if (!isSyncConfirmed) {
                    btnSync.textContent = "Ошибка (нет ответа)";
                    btnSync.classList.add("btn-error-flash");
                    setTimeout(() => {
                        btnSync.textContent = "Синхронизировать время";
                        btnSync.classList.remove("btn-error-flash");
                    }, 3000);
                }else {
                    // btnSync.disabled = false;
                    btnSync.textContent = "Синхронизировать время";
                    btnSync.classList.remove('sync-success-animate');
                }
            }
        }, 3000);
    } catch (error) {
        btnSync.textContent = "Ошибка отправки";
        btnSync.classList.add("btn-error-flash");
        btnSync.disabled = false;
        setTimeout(() => {
            btnSync.textContent = "Синхронизация";
            btnSync.classList.remove("btn-error-flash");
        }, 3000);
    }
});

// === ЭКСПОРТ ЛОКАЛЬНОГО АРХИВА В CSV ===
function downloadCsvBlob(csvContent, fileName) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

const btnExportCsv = document.getElementById('btn-export-csv');
if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
        if (!fullHistoryLabels || fullHistoryLabels.length === 0) {
            window.showToast('Нет данных на графике для экспорта', true);
            return;
        }

        let csvContent = "\uFEFFВремя;Температура (°C)\n";
        for (let i = 0; i < fullHistoryLabels.length; i++) {
            csvContent += `${fullHistoryLabels[i]};${String(fullHistoryData[i]).replace('.', ',')}\n`;
        }

        downloadCsvBlob(csvContent, `temp_history_${new Date().toISOString().slice(0, 10)}.csv`);
        window.showToast(`Экспортировано точек: ${fullHistoryLabels.length}`);
    });
}

// === ОТКЛЮЧЕНИЕ, KEEP-ALIVE И АВТОПЕРЕПОДКЛЮЧЕНИЕ ===
function onDisconnected() {
    setStatus("NORM", "Отключено");
    btnConnect.textContent = "Подключить";
    btnConnect.className = "connect-btn";
    btnSync.disabled = true;
    btnSync.textContent = "Синхронизировать время";
    btnSync.classList.remove("btn-error-flash", "sync-success-animate");

    if (isDownloadingEeprom) resetEepromDownloadState();

    if (typeof window.setRelayControlsDisabled === 'function') {
        window.setRelayControlsDisabled(true);
    }
    if (typeof window.stopWebTimer === 'function') {
        window.stopWebTimer();
    }

    const relayLabel = document.getElementById('relay-state-label');
    if (relayLabel) {
        relayLabel.textContent = "НЕТ СВЯЗИ";
        relayLabel.className = "status-offline";
    }

    tempOut.textContent = "--°C";
    document.getElementById('mcu-time').textContent = "--:--:--";
    document.getElementById('mcu-date').textContent = "--.--.----";
    dataCharacteristic = null;
}

setInterval(async () => {
    if (bluetoothDevice && bluetoothDevice.gatt.connected && dataCharacteristic) {
        try {
            const encoder = new TextEncoder();
            const pingCmd = encoder.encode("PING\n");
            if (dataCharacteristic.writeValueWithResponse) {
                await dataCharacteristic.writeValueWithResponse(pingCmd);
            } else {
                await dataCharacteristic.writeValue(pingCmd);
            }
        } catch (e) {}
    }
}, 5000);
