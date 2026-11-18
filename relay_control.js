/**
 * Модуль управления освещением и автоматами (relay_control.js) — Часть 1
 */

window.currentRelayMode = "AUTO";
let timerInterval = null;
let timerSecondsLeft = 0;

// Приглушение нажатой кнопки в ручном режиме освещения ('ON', 'OFF' или null)
function updateManualButtonsVisual(state) {
    const btnOn = document.getElementById('btn-relay-on');
    const btnOff = document.getElementById('btn-relay-off');
    if (!btnOn || !btnOff) return;

    btnOn.classList.remove('btn-dimmed');
    btnOff.classList.remove('btn-dimmed');

    if (state === 'ON') {
        btnOn.classList.add('btn-dimmed');
    } else if (state === 'OFF') {
        btnOff.classList.add('btn-dimmed');
    }
}

// 1. Переключение режимов блока "Управление светом" (AUTO / MANUAL / TIMER)
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
        updateManualButtonsVisual(null);

        if (wasTimerRunning) {
            await window.sendRelayCommand('LIGHT:OFF');
            await new Promise(r => setTimeout(r, 60));
        }
        window.sendRelayCommand('LIGHT:AUTO');

    } else if (mode === 'MANUAL') {
        document.getElementById('btn-mode-man').classList.add('active');
        document.getElementById('panel-manual').classList.remove('hidden');

        if (wasTimerRunning) {
            await window.sendRelayCommand('LIGHT:OFF');
            const label = document.getElementById('relay-state-label');
            if (label) {
                label.textContent = "ВЫКЛЮЧЕНА (РУЧНОЙ)";
                label.className = "status-off";
            }
            updateManualButtonsVisual('OFF');
        }

    } else if (mode === 'TIMER') {
        document.getElementById('btn-mode-time').classList.add('active');
        document.getElementById('panel-timer').classList.remove('hidden');
        updateManualButtonsVisual(null);
    }
};

// 2. Универсальная отправка команд в STM32 с разбивкой по 20 байт (MTU BLE)
window.sendRelayCommand = async function(cmdString) {
    if (typeof dataCharacteristic === 'undefined' || !dataCharacteristic) {
        if (typeof window.showToast === 'function') {
            window.showToast('Нет связи с STM32', true);
        }
        return false;
    }

    if (typeof window.resetPingTimer === 'function') {
        window.resetPingTimer();
    }

    if (typeof window.logToTerminal === 'function') {
        window.logToTerminal(cmdString, 'TX');
    }

try {
        const encoder = new TextEncoder();
        // Очищаем возможные скрытые пробелы/\r по краям и добавляем один \n
        const data = encoder.encode(cmdString + '\n');

        const hexBytes = Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        console.log(`BLE TX [${data.length} байт]: ${JSON.stringify(cmdString)} | HEX: ${hexBytes}`);

        if (dataCharacteristic.writeValueWithoutResponse) {
            await dataCharacteristic.writeValueWithoutResponse(data);
        } else if (dataCharacteristic.writeValueWithResponse) {
            await dataCharacteristic.writeValueWithResponse(data);
        } else {
            await dataCharacteristic.writeValue(data);
        }    

        const label = document.getElementById('relay-state-label');
        if (label && !cmdString.startsWith('CH') && !cmdString.startsWith('S')) {
            if (cmdString.startsWith('TIMER:')) {
                label.textContent = "ВКЛЮЧЕНА (ТАЙМЕР)";
                label.className = "status-on";
                updateManualButtonsVisual(null);
            } else if (cmdString === 'LIGHT:ON') {
                label.textContent = "ВКЛЮЧЕНА (РУЧНОЙ)";
                label.className = "status-on";
                updateManualButtonsVisual('ON');
            } else if (cmdString === 'LIGHT:OFF') {
                label.textContent = "ВЫКЛЮЧЕНА (РУЧНОЙ)";
                label.className = "status-off";
                updateManualButtonsVisual('OFF');
            } else if (cmdString === 'LIGHT:AUTO') {
                label.textContent = "АВТОМАТИЧЕСКИ";
                label.className = "status-on";
                updateManualButtonsVisual(null);
            }
        }
        return true;
    } catch (error) {
        if (typeof window.showToast === 'function') {
            window.showToast('Ошибка отправки команды', true);
        }
        return false;
    }
};
/**
 * Модуль управления освещением и автоматами (relay_control.js) — Часть 2
 */

// 3. Установка пресета минут в поле таймера
window.setTimerPreset = function(minutes) {
    if (timerInterval !== null) return;
    const inputEl = document.getElementById('input-timer-min');
    if (inputEl && !inputEl.disabled) {
        inputEl.value = minutes;
    }
};

// 4. Запуск и остановка таймера освещения (кнопка Пуск / Стоп)
window.toggleWebTimer = function() {
    if (timerInterval !== null) {
        window.stopWebTimer();
        window.sendRelayCommand('LIGHT:OFF');
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

// 5. Обратный отсчёт таймера на экране
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

// 6. Остановка визуального таймера
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

// 7. Блокировка / разблокировка кнопок обоих блоков при изменении связи BLE
window.setRelayControlsDisabled = function(isDisabled) {
    const controlIds = [
        'btn-mode-auto', 'btn-mode-man', 'btn-mode-time',
        'btn-relay-on', 'btn-relay-off', 'input-timer-min', 'btn-timer-start',
        'btn-ch-auto', 'btn-ch-on', 'btn-ch-off', 'btn-ch-save'
    ];

    controlIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isDisabled;
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.disabled = isDisabled;
    });

    if (isDisabled) {
        updateManualButtonsVisual(null);
        if (typeof updateBreakerButtonsVisual === 'function') {
            updateBreakerButtonsVisual(null, false);
        }
    } else if (typeof updateBreakerStatusLabel === 'function') {
        updateBreakerStatusLabel();
    }
};

// 8. Синхронизация статуса освещения по ответу от STM32 (STATUS:...)
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
        const remainingSec = parseInt(parts, 10);

        window.currentRelayMode = "TIMER";
        document.getElementById('btn-mode-time').classList.add('active');
        document.getElementById('panel-timer').classList.remove('hidden');
        updateManualButtonsVisual(null);

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
        updateManualButtonsVisual(null);
    } else if (statusStr === "AUTO_OFF") {
        window.currentRelayMode = "AUTO";
        document.getElementById('btn-mode-auto').classList.add('active');
        document.getElementById('panel-auto').classList.remove('hidden');
        label.textContent = "АВТО (ВЫКЛЮЧЕНА)";
        label.className = "status-off";
        updateManualButtonsVisual(null);
    } else if (statusStr === "MANUAL_ON") {
        window.currentRelayMode = "MANUAL";
        document.getElementById('btn-mode-man').classList.add('active');
        document.getElementById('panel-manual').classList.remove('hidden');
        label.textContent = "ВКЛЮЧЕНА (РУЧНОЙ)";
        label.className = "status-on";
        updateManualButtonsVisual('ON');
    } else if (statusStr === "MANUAL_OFF") {
        window.currentRelayMode = "MANUAL";
        document.getElementById('btn-mode-man').classList.add('active');
        document.getElementById('panel-manual').classList.remove('hidden');
        label.textContent = "ВЫКЛЮЧЕНА (РУЧНОЙ)";
        label.className = "status-off";
        updateManualButtonsVisual('OFF');
    }
};

/**
 * Модуль управления освещением и автоматами (relay_control.js) — Часть 3
 */

let activeBreakerChannel = 1;

let breakerSchedules = JSON.parse(localStorage.getItem('breaker_schedules')) || {
    1: { t1On: '07:00', t1Off: '09:00', t2On: '18:00', t2Off: '23:00' },
    2: { t1On: '08:00', t1Off: '12:00', t2On: '17:00', t2Off: '22:00' }
};

let savedModes = JSON.parse(localStorage.getItem('breaker_modes')) || {
    1: { btnState: null, isAuto: true },
    2: { btnState: null, isAuto: true }
};

let breakerChannelStates = {
    1: { text: "НЕТ СВЯЗИ", className: "status-offline", btnState: savedModes[1].btnState, isAuto: savedModes[1].isAuto },
    2: { text: "НЕТ СВЯЗИ", className: "status-offline", btnState: savedModes[2].btnState, isAuto: savedModes[2].isAuto }
};

function saveBreakerModesToLocal() {
    localStorage.setItem('breaker_modes', JSON.stringify({
        1: { btnState: breakerChannelStates[1].btnState, isAuto: breakerChannelStates[1].isAuto },
        2: { btnState: breakerChannelStates[2].btnState, isAuto: breakerChannelStates[2].isAuto }
    }));
}


function renderBreakerScheduleInputs() {
    const data = breakerSchedules[activeBreakerChannel];
    if (!data) return;

    document.getElementById('ch-t1-on').value = data.t1On;
    document.getElementById('ch-t1-off').value = data.t1Off;
    document.getElementById('ch-t2-on').value = data.t2On;
    document.getElementById('ch-t2-off').value = data.t2Off;
}

function updateBreakerButtonsVisual(state, isAuto) {
    const btnAuto = document.getElementById('btn-ch-auto');
    const btnOn = document.getElementById('btn-ch-on');
    const btnOff = document.getElementById('btn-ch-off');
    if (!btnAuto || !btnOn || !btnOff) return;

    if (btnAuto.disabled) {
        btnAuto.classList.remove('active-auto');
        btnOn.classList.remove('btn-dimmed');
        btnOff.classList.remove('btn-dimmed');
        return;
    }

    btnAuto.classList.toggle('active-auto', Boolean(isAuto));
    btnOn.classList.remove('btn-dimmed');
    btnOff.classList.remove('btn-dimmed');

    if (isAuto) {
        btnOn.classList.add('btn-dimmed');
        btnOff.classList.add('btn-dimmed');
    } else {
        if (state === 'ON') btnOn.classList.add('btn-dimmed');
        else if (state === 'OFF') btnOff.classList.add('btn-dimmed');
    }
}

function updateBreakerStatusLabel() {
    const label = document.getElementById('breaker-state-label');
    const st = breakerChannelStates[activeBreakerChannel];
    if (label && st) {
        label.textContent = st.text;
        label.className = st.className;
        updateBreakerButtonsVisual(st.btnState, st.isAuto);
    }
}

window.selectBreakerChannel = function(channel) {
    activeBreakerChannel = channel;
    document.getElementById('btn-ch-1').classList.toggle('active', channel === 1);
    document.getElementById('btn-ch-2').classList.toggle('active', channel === 2);

    renderBreakerScheduleInputs();
    updateBreakerStatusLabel();
};

window.saveBreakerScheduleToLocal = function() {
    breakerSchedules[activeBreakerChannel] = {
        t1On: document.getElementById('ch-t1-on').value || '00:00',
        t1Off: document.getElementById('ch-t1-off').value || '00:00',
        t2On: document.getElementById('ch-t2-on').value || '00:00',
        t2Off: document.getElementById('ch-t2-off').value || '00:00'
    };
    localStorage.setItem('breaker_schedules', JSON.stringify(breakerSchedules));
};

window.sendBreakerAuto = async function() {
    await window.sendRelayCommand(`CH${activeBreakerChannel}:AUTO`);

    breakerChannelStates[activeBreakerChannel] = {
        text: `КАНАЛ ${activeBreakerChannel}: АВТО (РАСПИСАНИЕ)`,
        className: 'status-on',
        btnState: null,
        isAuto: true
    };
    saveBreakerModesToLocal();
    updateBreakerStatusLabel();
};

window.sendBreakerManual = async function(state) {
    await window.sendRelayCommand(`CH${activeBreakerChannel}:${state}`);

    breakerChannelStates[activeBreakerChannel] = {
        text: state === 'ON'
            ? `КАНАЛ ${activeBreakerChannel}: РУЧНОЙ (ВКЛ)`
            : `КАНАЛ ${activeBreakerChannel}: РУЧНОЙ (ВЫКЛ)`,
        className: state === 'ON' ? 'status-on' : 'status-off',
        btnState: state,
        isAuto: false
    };
    saveBreakerModesToLocal();
    updateBreakerStatusLabel();
};

window.sendBreakerScheduleToMCU = async function() {
    window.saveBreakerScheduleToLocal();
    const btnSave = document.getElementById('btn-ch-save');
    if (btnSave) btnSave.disabled = true;

    const d = breakerSchedules[activeBreakerChannel];
    const clean = (t) => t.replace(':', '');
    
    //const cmd = `S${activeBreakerChannel}:${clean(d.t1On)}${clean(d.t1Off)}${clean(d.t2On)}${clean(d.t2Off)}`;

    // Отправляем двумя короткими командами по 12 символов с паузой 80 мс
    const cmd1 = `S${activeBreakerChannel}A:${clean(d.t1On)}${clean(d.t1Off)}`;
    const cmd2 = `S${activeBreakerChannel}B:${clean(d.t2On)}${clean(d.t2Off)}`;

    //const ok = await window.sendRelayCommand(cmd);
    const ok1 = await window.sendRelayCommand(cmd1);
    await new Promise(r => setTimeout(r, 80));
    const ok2 = await window.sendRelayCommand(cmd2);

    if (btnSave) btnSave.disabled = false;

    if (ok1 && ok2) {
        breakerChannelStates[activeBreakerChannel] = {
            text: `КАНАЛ ${activeBreakerChannel}: АВТО (РАСПИСАНИЕ)`,
            className: 'status-on',
            btnState: null,
            isAuto: true
        };
        saveBreakerModesToLocal();
        updateBreakerStatusLabel();

        if (typeof window.showToast === 'function') {
            window.showToast(`Расписание Канала ${activeBreakerChannel} отправлено`);
        }
    }
};

window.syncBreakerStatusFromMCU = function(line) {
    const ch = line.startsWith("CH1_STATUS:") ? 1 : 2;
    const rawState = line.split(":")[1]?.trim() || "";

    const map = {
        "AUTO_ON":  { text: `КАНАЛ ${ch}: АВТО (ВКЛ)`,    className: "status-on",  btnState: null,  isAuto: true },
        "AUTO_OFF": { text: `КАНАЛ ${ch}: АВТО (ВЫКЛ)`,   className: "status-off", btnState: null,  isAuto: true },
        "MAN_ON":   { text: `КАНАЛ ${ch}: РУЧНОЙ (ВКЛ)`,  className: "status-on",  btnState: 'ON',  isAuto: false },
        "MAN_OFF":  { text: `КАНАЛ ${ch}: РУЧНОЙ (ВЫКЛ)`, className: "status-off", btnState: 'OFF', isAuto: false }
    };

    if (map[rawState]) {
        breakerChannelStates[ch] = map[rawState];
        saveBreakerModesToLocal();
        if (activeBreakerChannel === ch) {
            updateBreakerStatusLabel();
        }
    }
};

window.syncBreakerScheduleFromMCU = function(line) {
    const ch = parseInt(line.charAt(1), 10);
    const digits = line.substring(3);
    if ((ch !== 1 && ch !== 2) || digits.length !== 16) return;

    const fmt = (pos) => `${digits.substr(pos, 2)}:${digits.substr(pos + 2, 2)}`;
    breakerSchedules[ch] = {
        t1On:  fmt(0),
        t1Off: fmt(4),
        t2On:  fmt(8),
        t2Off: fmt(12)
    };
    localStorage.setItem('breaker_schedules', JSON.stringify(breakerSchedules));

    if (activeBreakerChannel === ch) {
        renderBreakerScheduleInputs();
    }
};

window.setBreakersPendingState = function() {
    breakerChannelStates[1].text = "ЗАПРОС СОСТОЯНИЯ...";
    breakerChannelStates[1].className = "status-pending";
    breakerChannelStates[2].text = "ЗАПРОС СОСТОЯНИЯ...";
    breakerChannelStates[2].className = "status-pending";
    updateBreakerStatusLabel();
};

document.addEventListener('DOMContentLoaded', () => {
    renderBreakerScheduleInputs();
    updateBreakerStatusLabel();
});
