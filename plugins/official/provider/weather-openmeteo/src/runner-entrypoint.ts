import fetch from 'node-fetch';
import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';

startStdioJsonRuntime({
  pluginName: 'weather-openmeteo',
  version: '0.1.0',
  capabilities: ['weather.openmeteo.weekly_excel_rows'],
  async handleInvoke({ capability, input }) {
    if (capability !== 'weather.openmeteo.weekly_excel_rows') {
      fail(`unsupported capability: ${capability}`, 'unsupported_capability');
    }
    const city = optionalString(input?.city, 'Seoul');
    const country = optionalString(input?.country, 'KR');
    const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({
      name: city,
      count: '1',
      language: 'en',
      format: 'json'
    }).toString()}`);
    const first = Array.isArray(geo?.results) ? geo.results[0] : null;
    if (!first?.latitude || !first?.longitude) {
      fail(`Could not resolve city: ${city}`, 'provider_error');
    }
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    const weather = await fetchJson(`https://archive-api.open-meteo.com/v1/archive?${new URLSearchParams({
      latitude: String(first.latitude),
      longitude: String(first.longitude),
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      daily: 'temperature_2m_max,temperature_2m_min,temperature_2m_mean',
      timezone: 'auto'
    }).toString()}`);
    const daily = weather?.daily || {};
    const rows: any[] = [['City', 'Country', 'Date', 'Min C', 'Mean C', 'Max C']];
    const dates = Array.isArray(daily.time) ? daily.time : [];
    for (let index = 0; index < dates.length; index += 1) {
      rows.push([
        first.name || city,
        first.country_code || country,
        dates[index],
        daily.temperature_2m_min?.[index] ?? '',
        daily.temperature_2m_mean?.[index] ?? '',
        daily.temperature_2m_max?.[index] ?? ''
      ]);
    }
    return {
      ok: true,
      city: first.name || city,
      country: first.country_code || country,
      rows,
      rows_json: JSON.stringify(rows)
    };
  }
});

async function fetchJson(url: string) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    fail(`open-meteo request failed with status ${response.status}`, 'provider_error');
  }
  return body;
}

function optionalString(value: any, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function fail(message: string, code = 'runtime_error'): never {
  const error: any = new Error(message);
  error.code = code;
  throw error;
}
