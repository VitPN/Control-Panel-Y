/**
 * Астрономический расчёт восхода и захода солнца для г. Брест (sun_calendar.js)
 * Автоматически определяет часовой пояс системы через Intl API.
 */

// 1. Функция для безопасного получения смещения часового пояса через международный API
function getSystemTimezoneOffset() {
    try {
        const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const date = new Date();
        // Форматируем UTC-время в строку по правилам текущего системного региона
        const text = new Intl.DateTimeFormat('ru-RU', { timeZone: tzName, timeZoneName: 'longOffset' }).format(date);
        // Извлекаем из строки подпись вида GMT+03:00 или GMT+3
        const match = text.match(/[+-]\d+/);
        if (match) {
            return parseFloat(match[0]);
        }
    } catch (e) {
        console.warn("Ошибка Intl API, переключаемся на fallback через getTimezoneOffset");
    }
    // Резервный вариант на случай, если старый браузер не поддерживает Intl
    return (new Date().getTimezoneOffset() / -60);
}

// Автоматически присваиваем вычисленное значение часового пояса
window.currentSunTimezone = getSystemTimezoneOffset();
console.log(`[Timezone Auto]: Вычислен точный часовой пояс UTC+${window.currentSunTimezone} через Intl API.`);

// 2. Основная функция расчёта времени восхода и захода солнца
window.calculateSunTimings = function(offsetOffMin = 0, offsetOnMin = 0) {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const latitude = 52.097;
    const longitude = 23.687;
    
    // Используем динамический часовой пояс, определённый системой устройства
    const timeZone = window.currentSunTimezone; 

    const gamma = (2.0 * Math.PI / 365.0) * (dayOfYear - 1);
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2.0 * gamma) - 0.040849 * Math.sin(2.0 * gamma));
    const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2.0 * gamma) + 0.000907 * Math.sin(2.0 * gamma) - 0.002697 * Math.cos(3.0 * gamma) + 0.00148 * Math.sin(3.0 * gamma);

    const timeOffset = eqTime + 4.0 * longitude - 60.0 * timeZone;
    const tNoon = 720.0 - timeOffset;

    const latRad = latitude * Math.PI / 180.0;
    const cosHA = (Math.cos(90.833 * Math.PI / 180.0) / (Math.cos(latRad) * Math.cos(decl))) - (Math.tan(latRad) * Math.tan(decl));
    const HA = Math.acos(Math.max(-1, Math.min(1, cosHA))) * 180.0 / Math.PI;

    const sunriseMin = Math.round(tNoon - HA * 4.0);
    const sunsetMin = Math.round(tNoon + HA * 4.0);

    const formatMins = (totalMins) => {
        let m = ((totalMins % 1440) + 1440) % 1440;
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    return {
        sunrise: formatMins(sunriseMin),
        sunset: formatMins(sunsetMin),
        lightOff: formatMins(sunriseMin + offsetOffMin),
        lightOn: formatMins(sunsetMin + offsetOnMin)
    };
};





/**
 * Автономный расчет времени восхода и захода солнца для г. Бреста (UTC+3)
 * Не требует подключения к интернету и сторонних API.
 */
window.calculateB_t_SunTimings = function() {
    const now = new Date();
    
    // Географические координаты Бреста
    const latitude = 52.097;
    const longitude = 23.687;
    const timeZone = 3; // Поясное время UTC+3

    // Вычисляем порядковый номер дня в году
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    // Уравнение времени и склонения солнца
    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

    // Часовой угол истинного полдня
    const timeOffset = eqTime + 4 * longitude - 60 * timeZone;
    const tNoon = 720 - timeOffset;

    // Вычисляем часовой угол захода солнца (угол -0.833 градуса с учетом атмосферной рефракции)
    const latRad = latitude * Math.PI / 180;
    const cosHA = (Math.cos(90.833 * Math.PI / 180) / (Math.cos(latRad) * Math.cos(decl))) - (Math.tan(latRad) * Math.tan(decl));

    //if (cosHA < -1 || cosHA > 1) {
    //    return { sunrise: "--:--", sunset: "--:--" };
    //}
    if (cosHA < -1 || cosHA > 1) {
        return { sunrise: "--:--", sunset: "--:--", lightOn: "--:--", lightOff: "--:--" };
    }


    const HA = Math.acos(cosHA) * 180 / Math.PI;
    const tSunrise = tNoon - HA * 4;
    const tSunset = tNoon + HA * 4;

    // Функция форматирования минут в формат ЧЧ:ММ
    const formatMinutes = (minutes) => {
        let h = Math.floor(minutes / 60);
        let m = Math.floor(minutes % 60);
        if (h >= 24) h -= 24;
        if (h < 0) h += 24;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    };

    // Рассчитываем время света. 
    // При необходимости здесь можно заложить люфт, например: tSunset + 10 (включить через 10 минут после захода)
    const lightOffMinutes = tSunrise + offsetOffMinutes; 
    const lightOnMinutes = tSunset + offsetOnMinutes;

    return {
        sunrise: formatMinutes(tSunrise),
        sunset: formatMinutes(tSunset),
        lightOff: formatMinutes(lightOffMinutes),
        lightOn: formatMinutes(lightOnMinutes)
    };
};


/**
 * Автономный расчет времени восхода, захода солнца и коммутации света для г. Бреста (UTC+3)
 * Поддерживает кастомные смещения в минутах (offsets)
 */
window.calculateB_2222SunTimings = function(offsetOffMinutes = 0, offsetOnMinutes = 0) {
    const now = new Date();
    
    const latitude = 52.097;
    const longitude = 23.687;
    const timeZone = 3; 

    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const gamma = (2 * Math.PI / 365) * (dayOfYear - 1);
    const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

    const timeOffset = eqTime + 4 * longitude - 60 * timeZone;
    const tNoon = 720 - timeOffset;

    const latRad = latitude * Math.PI / 180;
    const cosHA = (Math.cos(90.833 * Math.PI / 180) / (Math.cos(latRad) * Math.cos(decl))) - (Math.tan(latRad) * Math.tan(decl));

    //if (cosHA < -1 || cosHA > 1) {
    //    return { sunrise: "--:--", sunset: "--:--" };
    //}
    if (cosHA < -1 || cosHA > 1) {
        return { sunrise: "--:--", sunset: "--:--", lightOn: "--:--", lightOff: "--:--" };
    }

    const HA = Math.acos(cosHA) * 180 / Math.PI;
    const tSunrise = tNoon - HA * 4;
    const tSunset = tNoon + HA * 4;

    const formatMinutes = (minutes) => {
        let h = Math.floor(minutes / 60);
        let m = Math.floor(minutes % 60);
        if (h >= 24) h -= 24;
        if (h < 0) h += 24;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    };

    // Применяем введенные пользователем смещения к базовому времени солнца
    const lightOffMinutes = tSunrise + offsetOffMinutes; 
    const lightOnMinutes = tSunset + offsetOnMinutes;

    return {
        sunrise: formatMinutes(tSunrise),
        sunset: formatMinutes(tSunset),
        lightOff: formatMinutes(lightOffMinutes),
        lightOn: formatMinutes(lightOnMinutes)
    };
};
