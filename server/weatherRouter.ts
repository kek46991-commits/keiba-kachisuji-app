import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

// ─────────────────────────────────────────────
// JRA競馬場の座標データ
// ─────────────────────────────────────────────
const VENUE_COORDS: Record<string, { lat: number; lon: number; name: string }> = {
  tokyo:    { lat: 35.6762, lon: 139.6503, name: "東京" },
  nakayama: { lat: 35.7756, lon: 139.9236, name: "中山" },
  hanshin:  { lat: 34.8167, lon: 135.3833, name: "阪神" },
  kyoto:    { lat: 34.9667, lon: 135.7667, name: "京都" },
  chukyo:   { lat: 35.1167, lon: 136.9667, name: "中京" },
  kokura:   { lat: 33.8833, lon: 130.8667, name: "小倉" },
  sapporo:  { lat: 43.0500, lon: 141.3500, name: "札幌" },
  hakodate: { lat: 41.7667, lon: 140.7333, name: "函館" },
  niigata:  { lat: 37.9167, lon: 139.0667, name: "新潟" },
  fukushima:{ lat: 37.7500, lon: 140.4667, name: "福島" },
};

// ─────────────────────────────────────────────
// WMOコード → 天気ラベル変換
// https://open-meteo.com/en/docs#weathervariables
// ─────────────────────────────────────────────
function wmoToWeather(code: number): {
  label: string;
  emoji: string;
  weather: "sunny" | "cloudy" | "lightRain" | "rain" | "heavyRain" | "afterRain";
} {
  if (code === 0) return { label: "快晴", emoji: "☀️", weather: "sunny" };
  if (code <= 2) return { label: "晴れ", emoji: "🌤️", weather: "sunny" };
  if (code === 3) return { label: "曇り", emoji: "☁️", weather: "cloudy" };
  if (code <= 49) return { label: "霧", emoji: "🌫️", weather: "cloudy" };
  if (code <= 59) return { label: "霧雨", emoji: "🌦️", weather: "lightRain" };
  if (code <= 65) return { label: "雨", emoji: "🌧️", weather: "rain" };
  if (code <= 69) return { label: "みぞれ", emoji: "🌨️", weather: "rain" };
  if (code <= 79) return { label: "雪", emoji: "❄️", weather: "cloudy" };
  if (code <= 82) return { label: "にわか雨", emoji: "🌦️", weather: "lightRain" };
  if (code <= 84) return { label: "強いにわか雨", emoji: "⛈️", weather: "heavyRain" };
  if (code <= 94) return { label: "雷雨", emoji: "⛈️", weather: "heavyRain" };
  return { label: "激しい雷雨", emoji: "🌩️", weather: "heavyRain" };
}

// ─────────────────────────────────────────────
// 降水量・天気から路面状態を自動判定
// ─────────────────────────────────────────────
function inferTrackCondition(
  precipitation: number,
  precipitationLast3h: number,
  weatherCode: number
): {
  condition: "good" | "slightlyHeavy" | "heavy" | "veryHeavy";
  label: string;
  confidence: "high" | "medium" | "low";
} {
  // 現在の降水量 + 直近3時間の累積降水量で判定
  const totalRain = precipitation + precipitationLast3h;

  if (totalRain === 0 && weatherCode <= 3) {
    return { condition: "good", label: "良", confidence: "high" };
  }
  if (totalRain < 1 && weatherCode <= 61) {
    return { condition: "slightlyHeavy", label: "稍重", confidence: "medium" };
  }
  if (totalRain < 5) {
    return { condition: "heavy", label: "重", confidence: "medium" };
  }
  return { condition: "veryHeavy", label: "不良", confidence: "low" };
}

// ─────────────────────────────────────────────
// ルーター
// ─────────────────────────────────────────────
export const weatherRouter = router({
  // 競馬場の現在天気を取得
  getVenueWeather: publicProcedure
    .input(z.object({
      venue: z.string(), // "tokyo" | "nakayama" | etc.
    }))
    .query(async ({ input }) => {
      const coords = VENUE_COORDS[input.venue];
      if (!coords) {
        return {
          error: `競馬場「${input.venue}」の座標データがありません`,
          venue: input.venue,
          venueName: input.venue,
        };
      }

      try {
        // Open-Meteo API（無料・APIキー不要）
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", coords.lat.toString());
        url.searchParams.set("longitude", coords.lon.toString());
        url.searchParams.set("current", [
          "temperature_2m",
          "precipitation",
          "weathercode",
          "windspeed_10m",
          "relativehumidity_2m",
        ].join(","));
        // 直近3時間の降水量（路面状態判定に使用）
        url.searchParams.set("hourly", "precipitation");
        url.searchParams.set("forecast_hours", "3");
        url.searchParams.set("timezone", "Asia/Tokyo");

        const resp = await fetch(url.toString(), {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(8000),
        });

        if (!resp.ok) {
          throw new Error(`Open-Meteo API error: ${resp.status}`);
        }

        const data = await resp.json() as {
          current: {
            temperature_2m: number;
            precipitation: number;
            weathercode: number;
            windspeed_10m: number;
            relativehumidity_2m: number;
          };
          hourly?: {
            precipitation: number[];
          };
        };

        const current = data.current;
        const precipLast3h = data.hourly?.precipitation
          ? data.hourly.precipitation.reduce((sum, v) => sum + (v ?? 0), 0)
          : 0;

        const weatherInfo = wmoToWeather(current.weathercode);
        const trackInfo = inferTrackCondition(
          current.precipitation,
          precipLast3h,
          current.weathercode
        );

        return {
          venue: input.venue,
          venueName: coords.name,
          lat: coords.lat,
          lon: coords.lon,
          temperature: current.temperature_2m,
          precipitation: current.precipitation,
          precipitationLast3h: precipLast3h,
          humidity: current.relativehumidity_2m,
          windSpeed: current.windspeed_10m,
          weatherCode: current.weathercode,
          weatherLabel: weatherInfo.label,
          weatherEmoji: weatherInfo.emoji,
          weather: weatherInfo.weather,
          trackCondition: trackInfo.condition,
          trackConditionLabel: trackInfo.label,
          trackConditionConfidence: trackInfo.confidence,
          fetchedAt: new Date().toISOString(),
          error: null,
        };
      } catch (err) {
        return {
          error: `天気取得に失敗しました: ${err instanceof Error ? err.message : "不明なエラー"}`,
          venue: input.venue,
          venueName: coords.name,
          temperature: null,
          precipitation: null,
          precipitationLast3h: null,
          humidity: null,
          windSpeed: null,
          weatherCode: null,
          weatherLabel: null,
          weatherEmoji: null,
          weather: null,
          trackCondition: null,
          trackConditionLabel: null,
          trackConditionConfidence: null,
          fetchedAt: new Date().toISOString(),
        };
      }
    }),

  // 全競馬場の天気を一括取得
  getAllVenueWeather: publicProcedure.query(async () => {
    const venues = Object.keys(VENUE_COORDS);
    const results = await Promise.allSettled(
      venues.map(async (venue) => {
        const coords = VENUE_COORDS[venue]!;
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", coords.lat.toString());
        url.searchParams.set("longitude", coords.lon.toString());
        url.searchParams.set("current", "temperature_2m,precipitation,weathercode");
        url.searchParams.set("timezone", "Asia/Tokyo");

        const resp = await fetch(url.toString(), {
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json() as {
          current: { temperature_2m: number; precipitation: number; weathercode: number };
        };
        const weatherInfo = wmoToWeather(data.current.weathercode);
        const trackInfo = inferTrackCondition(data.current.precipitation, 0, data.current.weathercode);
        return {
          venue,
          venueName: coords.name,
          temperature: data.current.temperature_2m,
          weatherEmoji: weatherInfo.emoji,
          weatherLabel: weatherInfo.label,
          weather: weatherInfo.weather,
          trackCondition: trackInfo.condition,
          trackConditionLabel: trackInfo.label,
        };
      })
    );

    return results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { venue: venues[i], venueName: VENUE_COORDS[venues[i]!]?.name ?? venues[i], error: String(r.reason) }
    );
  }),
});
