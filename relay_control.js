/**
 * Модуль управления освещением (relay_control.js)
 * Поддерживает аппаратный таймер STM32 (TIMER:минуты / STATUS:TIMER_ON:секунды), AUTO и MANUAL.
 */

window.currentRelayMode = "AUTO";
let timerInterval = null;
let timerSecondsLeft = 0;

// 1. Переключение режимов интерфейса (AUTO / MANUAL / TIMER)
window.setRelayMode = async function(mode) {
    const wasTimerRunning = (timerInterval !== null);
    window.currentRelayMode = mode;

    document.getElementById('btn-mode-auto').classList.remove('active');
    document.getElementById('btn-mode-man').classList.remove('active');
    document.getElementById('btn-mode-time').classList.remove('active');

    document.getElementById('panel-auto').classList.add('hidden');
    document.getElementById('panel-manual').classList.add('hidden');
    document.getElementById('panel-timer').classList.add('hidden');

    if (mode !== 'TIMER') {
        window.stopWebTimer();
    }

    if (mode === 'AUTO') {
        document.getElementById('btn-mode-auto').classList.add('active');
        document.getElementById('panel-auto').classList.remove('hidden');

        if (wasTimerRunning) {
            await window.sendRelayCommand('RELAY:OFF');
            await new Promise(r => setTimeout(r, 60));
        }
        window.sendRelayCommand('RELAY:AUTO');

    } else if (mode === 'MANUAL') {
        document.getElementById('btn-mode-man').classList.add('active');
        document.getElementById('panel-manual').classList.remove('hidden');

        if (wasTimerRunning) {
            await window.sendRelayCommand('RELAY:OFF');
            const label = document.getElementById('relay-state-label');
            if (label) {
                label.textContent = "ВЫКЛЮЧЕНА (РУЧНОЙ)";
                label.className = "status-off";
            }
        }

    } else if (mode === 'TIMER') {
        document.getElementById('btn-mode-time').classList.add('active');
        document.getElementById('panel-timer').classList.remove('hidden');
    }
};

// Визуальное приглушение нажатой кнопки в ручном режиме ('ON', 'OFF' или null — обе яркие)
function updateManualButtonsVisual(state) {
    const btnOn = document.getElementById('btn-relay-on');
    const btnOff = document.getElementById('btn-relay-off');
    if (!btnOn || !btnOff) return;

    btnOn.classList.remove('btn-dimmed');
    btnOff.classList.remove('btn-dimmed');

    if (state === 'ON') {
        btnOn.classList.add('btn-dimmed');  // Свет включён -> приглушаем "Включить", "Выключить" яркая
    } else if (state === 'OFF') {
        btnOff.classList.add('btn-dimmed'); // Свет выключен -> приглушаем "Выключить", "Включить" яркая
    }
};


// 2. Отправка команд управления реле в микроконтроллер STM32
window.sendRelayCommand = async function(cmdString) {
    if (typeof dataCharacteristic === 'undefined' || !dataCharacteristic) {
        if (typeof window.showToast === 'function') {
            window.showToast('Нет связи с STM32', true);
        }
        return;
    }

    try {
        const encoder = new TextEncoder();
        const fullCmd = cmdString + '\n';

        if (dataCharacteristic.writeValueWithResponse) {
            await dataCharacteristic.writeValueWithResponse(encoder.encode(fullCmd));
        } else {
            await dataCharacteristic.writeValue(encoder.encode(fullCmd));
        }

        const label = document.getElementById('relay-state-label');
        if (label) {
            if (cmdString.startsWith('TIMER:')) {
                label.textContent = "ВКЛЮЧЕНА (ТАЙМЕР)";
                label.className = "status-on";
            } else if (cmdString === 'RELAY:ON') {
                label.textContent = "ВКЛЮЧЕНА (РУЧНОЙ)";
                label.className = "status-on";   
                updateManualButtonsVisual('ON');  // Обновление видимости кнопок Включить \ Выключить
            } else if (cmdString === 'RELAY:OFF') {
                label.textContent = "ВЫКЛЮЧЕНА (РУЧНОЙ)";
                label.className = "status-off";
                updateManualButtonsVisual('OFF');  // Обновление видимости кнопок Включить \ Выключить
            } else if (cmdString === 'RELAY:AUTO') {
                label.textContent = "АВТОМАТИЧЕСКИ";
                label.className = "status-on";
            }
        }
    } catch (error) {
        if (typeof window.showToast === 'function') {
            window.showToast('Ошибка отправки команды реле', true);
        }
    }
};

// 3. Установка выбранного пресета минут в поле ввода таймера
window.setTimerPreset = function(minutes) {
    if (timerInterval !== null) return;
    const inputEl = document.getElementById('input-timer-min');
    if (inputEl && !inputEl.disabled) {
        inputEl.value = minutes;
    }
};

// 4. Запуск и ручная остановка таймера (кнопка Пуск / Стоп)
window.toggleWebTimer = function() {
    if (timerInterval !== null) {
        window.stopWebTimer();
        window.sendRelayCommand('RELAY:OFF');
        return;
    }

    const inputEl = document.getElementById('input-timer-min');
    const minutesInput = parseInt(inputEl.value, 10);

    if (isNaN(minutesInput) || minutesInput <= 0) {
        inputEl.value = "";
        inputEl.focus();
        if (typeof window.showToast === 'function') {
            window.showToast('Введите время таймера (от 1 мин)', true);
        }
        return;
    }

    const validMinutes = Math.min(1440, minutesInput);
    inputEl.value = validMinutes;

    window.sendRelayCommand(`TIMER:${validMinutes}`);
    startVisualCountdown(validMinutes * 60);
};

// 5. Запуск визуального обратного отсчёта
function startVisualCountdown(seconds) {
    window.stopWebTimer();
    timerSecondsLeft = seconds;

    const inputEl = document.getElementById('input-timer-min');
    if (inputEl) inputEl.disabled = true;

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.disabled = true;
    });

    const btnTimer = document.getElementById('btn-timer-start');
    if (btnTimer) {
        btnTimer.textContent = "Стоп";
        btnTimer.classList.remove('btn-timer-start');
        btnTimer.classList.add('btn-relay-off');
    }

    const label = document.getElementById('relay-state-label');
    if (label) {
        label.textContent = "ВКЛЮЧЕНА (ТАЙМЕР)";
        label.className = "status-on";
    }

    const countdownEl = document.getElementById('timer-countdown');
    if (countdownEl) countdownEl.classList.remove('hidden');
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timerSecondsLeft--;
        updateTimerDisplay();

        if (timerSecondsLeft <= 0) {
            window.stopWebTimer();
            window.syncRelayStatusFromMCU("AUTO_OFF");
        }
    }, 1000);
}

// 6. Полный сброс визуального таймера и разблокировка полей ввода
window.stopWebTimer = function() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const inputEl = document.getElementById('input-timer-min');
    if (inputEl) inputEl.disabled = false;

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.disabled = false;
    });

    const btnTimer = document.getElementById('btn-timer-start');
    if (btnTimer) {
        btnTimer.textContent = "Пуск";
        btnTimer.classList.remove('btn-relay-off');
        btnTimer.classList.add('btn-timer-start');
    }

    const countdownEl = document.getElementById('timer-countdown');
    if (countdownEl) countdownEl.classList.add('hidden');
};

// 7. Форматирование оставшихся секунд в ЧЧ:ММ:СС или ММ:СС
function updateTimerDisplay() {
    const h = Math.floor(timerSecondsLeft / 3600);
    const m = Math.floor((timerSecondsLeft % 3600) / 60);
    const s = timerSecondsLeft % 60;

    let timeStr = "";
    if (h > 0) timeStr += String(h).padStart(2, '0') + ":";
    timeStr += String(m).padStart(2, '0') + ":" + String(s).padStart(2, '0');

    const valEl = document.getElementById('countdown-val');
    if (valEl) valEl.textContent = timeStr;
}

// 8. Блокировка / разблокировка всего пульта при отключении и подключении BLE
window.setRelayControlsDisabled = function(isDisabled) {
    const controlIds = [
        'btn-mode-auto',
        'btn-mode-man',
        'btn-mode-time',
        'btn-relay-on',
        'btn-relay-off',
        'input-timer-min',
        'btn-timer-start'
    ];

    controlIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isDisabled;
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.disabled = isDisabled;
    });
    if (isDisabled) {
    updateManualButtonsVisual(null);  // Обновление видимости кнопок Включить \ Выключить
    }
};

// 9. Синхронизация интерфейса с реальным состоянием STM32 (после GET_STATUS)
window.syncRelayStatusFromMCU = function(statusStr) {
    const label = document.getElementById('relay-state-label');
    if (!label) return;

    document.getElementById('btn-mode-auto').classList.remove('active');
    document.getElementById('btn-mode-man').classList.remove('active');
    document.getElementById('btn-mode-time').classList.remove('active');
    document.getElementById('panel-auto').classList.add('hidden');
    document.getElementById('panel-manual').classList.add('hidden');
    document.getElementById('panel-timer').classList.add('hidden');

    if (statusStr.startsWith("TIMER_ON:")) {
        const parts = statusStr.split(":");
        const remainingSec = parseInt(parts[1], 10);

        window.currentRelayMode = "TIMER";
        document.getElementById('btn-mode-time').classList.add('active');
        document.getElementById('panel-timer').classList.remove('hidden');

        if (!isNaN(remainingSec) && remainingSec > 0) {
            startVisualCountdown(remainingSec);
        }
        return;
    }

    window.stopWebTimer();

    if (statusStr === "AUTO_ON") {
        window.currentRelayMode = "AUTO";
        document.getElementById('btn-mode-auto').classList.add('active');
        document.getElementById('panel-auto').classList.remove('hidden');
        label.textContent = "АВТО (ВКЛЮЧЕНА)";
        label.className = "status-on";
    } else if (statusStr === "AUTO_OFF") {
        window.currentRelayMode = "AUTO";
        document.getElementById('btn-mode-auto').classList.add('active');
        document.getElementById('panel-auto').classList.remove('hidden');
        label.textContent = "АВТО (ВЫКЛЮЧЕНА)";
        label.className = "status-off";
    } else if (statusStr === "MANUAL_ON") {
        window.currentRelayMode = "MANUAL";
        document.getElementById('btn-mode-man').classList.add('active');
        document.getElementById('panel-manual').classList.remove('hidden');
        label.textContent = "ВКЛЮЧЕНА (РУЧНОЙ)";
        label.className = "status-on";
        updateManualButtonsVisual('ON');  // Обновление видимости кнопок Включить \ Выключить
    } else if (statusStr === "MANUAL_OFF") {
        window.currentRelayMode = "MANUAL";
        document.getElementById('btn-mode-man').classList.add('active');
        document.getElementById('panel-manual').classList.remove('hidden');
        label.textContent = "ВЫКЛЮЧЕНА (РУЧНОЙ)";
        label.className = "status-off";
        updateManualButtonsVisual('OFF');  // Обновление видимости кнопок Включить \ Выключить
    }
};
