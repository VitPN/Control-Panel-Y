/**
 * Модуль терминала отладки UART / BLE (terminal.js)
 */

// 1. Вывод сообщений в окно терминала с подсветкой RX (зелёный), TX (синий) и ошибок (красный)
window.logToTerminal = function(text, direction = 'RX') {
    const termOut = document.getElementById('terminal-output');
    if (!termOut) return;

    const timeStr = new Date().toLocaleTimeString('ru-RU');
    const lineEl = document.createElement('div');
    lineEl.className = 'term-line';

    const isError = text.includes('Error') || text.startsWith('CRC_ERR');
    const dirClass = isError ? 'term-error' : (direction === 'TX' ? 'term-tx' : 'term-rx');

    lineEl.innerHTML = `<span class="term-time">[${timeStr}]</span><span class="${dirClass}">${direction}: ${text}</span>`;
    termOut.appendChild(lineEl);

    while (termOut.children.length > 150) {
        termOut.removeChild(termOut.firstChild);
    }
    termOut.scrollTop = termOut.scrollHeight;
};

// 2. Очистка окна логов терминала
window.clearTerminal = function() {
    const termOut = document.getElementById('terminal-output');
    if (termOut) termOut.innerHTML = '';
};

// 3. Блокировка и разблокировка поля ввода и кнопки отправки терминала
window.setTerminalDisabled = function(isDisabled) {
    const cmdInput = document.getElementById('terminal-cmd-input');
    const btnSend = document.getElementById('btn-terminal-send');
    if (cmdInput) cmdInput.disabled = isDisabled;
    if (btnSend) btnSend.disabled = isDisabled;
};

// 4. Отправка ручной команды из строки ввода терминала
window.sendManualTerminalCommand = async function() {
    const inputEl = document.getElementById('terminal-cmd-input');
    if (!inputEl) return;

    const cmd = inputEl.value.trim();
    if (!cmd) return;

    if (typeof window.sendRelayCommand === 'function') {
        const ok = await window.sendRelayCommand(cmd);
        if (ok) {
            inputEl.value = '';
        }
    }
};

// 5. Подключение отправки команды по клавише Enter при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    const termInput = document.getElementById('terminal-cmd-input');
    if (termInput) {
        termInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.sendManualTerminalCommand();
            }
        });
    }
});
