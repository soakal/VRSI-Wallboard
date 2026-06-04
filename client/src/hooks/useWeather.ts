import { useQuery } from '@tanstack/react-query';

export interface WeatherForecastDay {
  day: string;
  date: string;
  code: number;
  hi: number;
  lo: number;
}

export interface WeatherData {
  currentTemp: number;
  condition: string;
  conditionEmoji: string;
  forecast: WeatherForecastDay[];
  sunsetIso: string;
}

// WMO weather interpretation codes -> label + emoji
export function interpretWeatherCode(code: number): { condition: string; conditionEmoji: string } {
  if (code === 0) return { condition: 'Clear', conditionEmoji: '☀️' };
  if (code === 1) return { condition: 'Mostly Clear', conditionEmoji: '🌤️' };
  if (code === 2) return { condition: 'Partly Cloudy', conditionEmoji: '⛅' };
  if (code === 3) return { condition: 'Overcast', conditionEmoji: '☁️' };
  if (code >= 45 && code <= 48) return { condition: 'Foggy', conditionEmoji: '🌫️' };
  if (code >= 51 && code <= 57) return { condition: 'Drizzle', conditionEmoji: '🌦️' };
  if (code >= 61 && code <= 67) return { condition: 'Rain', conditionEmoji: '🌧️' };
  if (code >= 71 && code <= 77) return { condition: 'Snow', conditionEmoji: '❄️' };
  if (code >= 80 && code <= 82) return { condition: 'Rain Showers', conditionEmoji: '🌧️' };
  if (code === 85 || code === 86) return { condition: 'Snow Showers', conditionEmoji: '🌨️' };
  if (code === 95) return { condition: 'Thunderstorm', conditionEmoji: '⛈️' };
  if (code === 96 || code === 99) return { condition: 'Hail Storm', conditionEmoji: '⛈️' };
  return { condition: 'Unknown', conditionEmoji: '🌡️' };
}

function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

async function fetchWeather(
  lat: number,
  lon: number,
  tempUnit: 'F' | 'C'
): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunset',
    temperature_unit: 'celsius',
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '5',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('Failed to fetch weather');

  const json = await res.json() as Record<string, unknown>;

  if (
    typeof json.current !== 'object' || json.current === null ||
    typeof json.daily !== 'object' || json.daily === null
  ) {
    throw new Error('Unexpected weather response shape');
  }

  const current = json.current as Record<string, number>;
  const daily = json.daily as Record<string, unknown[]>;

  const rawTemp: number = current.temperature_2m;
  const currentCode: number = current.weather_code;
  const { condition, conditionEmoji } = interpretWeatherCode(currentCode);

  const currentTemp =
    tempUnit === 'F' ? celsiusToFahrenheit(rawTemp) : Math.round(rawTemp);

  const dates = daily.time as string[];
  const highs = daily.temperature_2m_max as number[];
  const lows = daily.temperature_2m_min as number[];
  const sunsets = daily.sunset as string[];
  const codes = daily.weather_code as number[];

  const forecast: WeatherForecastDay[] = dates.map((dateStr, i) => {
    const dayLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
    });
    const hi =
      tempUnit === 'F' ? celsiusToFahrenheit(highs[i]) : Math.round(highs[i]);
    const lo =
      tempUnit === 'F' ? celsiusToFahrenheit(lows[i]) : Math.round(lows[i]);
    return { day: dayLabel, date: dateStr, code: codes[i], hi, lo };
  });

  const sunsetIso = sunsets[0] ?? '';

  return { currentTemp, condition, conditionEmoji, forecast, sunsetIso };
}

export function useWeather(
  lat: number | null,
  lon: number | null,
  tempUnit: 'F' | 'C'
) {
  return useQuery<WeatherData, Error>({
    queryKey: ['weather', lat, lon, tempUnit],
    queryFn: () => fetchWeather(lat!, lon!, tempUnit),
    enabled: lat !== null && lon !== null,
    refetchInterval: 1800000,
    staleTime: 1800000,
  });
}
