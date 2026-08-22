import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import { ChevronLeft, ChevronRight, Calendar, MapPin, Trophy, Clock, ExternalLink, Zap } from "lucide-react";
import { Link } from "wouter";

/** NAR競馬場コード（keiba.go.jp） */
const NAR_VENUE_CODES: Record<string, string> = {
  "帯広": "3",
  "門別": "36",
  "盛岡": "10",
  "水沢": "11",
  "浦和": "18",
  "船橋": "19",
  "大井": "20",
  "川崎": "21",
  "金沢": "22",
  "笠松": "23",
  "名古屋": "24",
  "園田": "27",
  "姫路": "28",
  "高知": "31",
  "佐賀": "32",
};

function getNarRaceListUrl(venue: string, dateStr: string | null): string {
  const code = NAR_VENUE_CODES[venue] || "";
  const date = dateStr ? dateStr.replace(/-/g, "%2F") : "";
  if (code && date) {
    return `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceList?k_raceDate=${date}&k_babaCode=${code}`;
  }
  return "https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/TodayRaceInfoTop";
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

type FilterMode = "all" | "jra" | "nar";

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  return { firstDay, daysInMonth };
}

function gradeColor(grade: string | null | undefined) {
  if (!grade) return "";
  switch (grade) {
    case "G1": return "text-red-400 font-bold";
    case "G2": return "text-blue-400 font-bold";
    case "G3": return "text-green-400 font-bold";
    case "L": return "text-purple-400";
    case "OP": return "text-yellow-400";
    default: return "text-gray-400";
  }
}

function gradeBadge(grade: string) {
  const colors: Record<string, string> = {
    G1: "bg-red-500/20 text-red-300 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.3)]",
    G2: "bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.3)]",
    G3: "bg-green-500/20 text-green-300 border-green-500/40 shadow-[0_0_8px_rgba(34,197,94,0.3)]",
    L: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    OP: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  };
  return colors[grade] || "bg-gray-500/20 text-gray-300 border-gray-500/40";
}

/** JRA競馬場の色 */
function jraVenueBadgeColor(venue: string) {
  const colors: Record<string, string> = {
    "東京": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "中山": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "阪神": "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "京都": "bg-purple-500/20 text-purple-300 border-purple-500/30",
    "中京": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    "新潟": "bg-teal-500/20 text-teal-300 border-teal-500/30",
    "福島": "bg-pink-500/20 text-pink-300 border-pink-500/30",
    "小倉": "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "札幌": "bg-sky-500/20 text-sky-300 border-sky-500/30",
    "函館": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  };
  return colors[venue] || "bg-gray-500/20 text-gray-300 border-gray-500/30";
}

/** NAR競馬場の色 */
function narVenueBadgeColor(venue: string) {
  const colors: Record<string, string> = {
    "大井": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "川崎": "bg-rose-500/20 text-rose-300 border-rose-500/30",
    "船橋": "bg-lime-500/20 text-lime-300 border-lime-500/30",
    "浦和": "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
    "門別": "bg-violet-500/20 text-violet-300 border-violet-500/30",
    "帯広": "bg-stone-500/20 text-stone-300 border-stone-500/30",
    "盛岡": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "水沢": "bg-teal-500/20 text-teal-300 border-teal-500/30",
    "金沢": "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "笠松": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "名古屋": "bg-red-500/20 text-red-300 border-red-500/30",
    "園田": "bg-green-500/20 text-green-300 border-green-500/30",
    "姫路": "bg-pink-500/20 text-pink-300 border-pink-500/30",
    "高知": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    "佐賀": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  };
  return colors[venue] || "bg-gray-500/20 text-gray-300 border-gray-500/30";
}

function venueBadgeColor(venue: string, organizer?: string) {
  if (organizer === "NAR") return narVenueBadgeColor(venue);
  return jraVenueBadgeColor(venue);
}

export default function RaceCalendarPage() {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const [year, setYear] = useState(jstNow.getFullYear());
  const [month, setMonth] = useState(jstNow.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const scheduleListRef = useRef<HTMLDivElement>(null);
  const venueRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { data: monthData, isLoading } = trpc.schedule.getMonthSchedule.useQuery({ year, month });
  const { data: daySchedule, isLoading: dayLoading } = trpc.schedule.getByDate.useQuery(
    { date: selectedDate! },
    { enabled: !!selectedDate }
  );

  // 穴狙い警報データ（選択日）
  const { data: dayAlerts } = trpc.anaUma.getDayAlerts.useQuery(
    { date: selectedDate! },
    { enabled: !!selectedDate, staleTime: 5 * 60 * 1000, retry: 1 }
  );

  const { firstDay, daysInMonth } = useMemo(() => getMonthDays(year, month), [year, month]);

  // 日付ごとの開催情報マップ（フィルター適用）
  const dayInfoMap = useMemo(() => {
    const map: Record<number, { jraVenues: string[]; narVenues: string[]; venues: string[]; gradeRaces: Array<{ name: string; grade: string; venue: string; organizer?: string }> }> = {};
    if (monthData?.days) {
      for (const d of monthData.days) {
        const jraVenues = (d as any).jraVenues || [];
        const narVenues = (d as any).narVenues || [];
        
        let filteredVenues: string[];
        let filteredGradeRaces = d.gradeRaces;
        
        if (filter === "jra") {
          filteredVenues = jraVenues;
          filteredGradeRaces = d.gradeRaces.filter((gr: any) => gr.organizer !== "NAR");
        } else if (filter === "nar") {
          filteredVenues = narVenues;
          filteredGradeRaces = d.gradeRaces.filter((gr: any) => gr.organizer === "NAR");
        } else {
          filteredVenues = [...jraVenues, ...narVenues];
        }
        
        if (filteredVenues.length > 0 || filteredGradeRaces.length > 0) {
          map[d.day] = { jraVenues, narVenues, venues: filteredVenues, gradeRaces: filteredGradeRaces };
        }
      }
    }
    return map;
  }, [monthData, filter]);

  // 日付選択時のスケジュール（フィルター適用）
  const dayScheduleGrouped = useMemo(() => {
    if (!daySchedule) return {};
    const filtered = filter === "all"
      ? daySchedule
      : daySchedule.filter((r: any) => filter === "jra" ? r.organizer !== "NAR" : r.organizer === "NAR");
    
    const grouped: Record<string, typeof daySchedule> = {};
    for (const race of filtered) {
      if (race.raceNumber === 0) continue; // NAR開催日情報（個別レースではない）はスキップ
      if (!grouped[race.venue]) grouped[race.venue] = [];
      grouped[race.venue]!.push(race);
    }
    // 各競馬場内をレース番号順にソート
    for (const venue of Object.keys(grouped)) {
      grouped[venue]!.sort((a, b) => a.raceNumber - b.raceNumber);
    }
    return grouped;
  }, [daySchedule, filter]);

  // NAR開催情報（raceNumber=0のデータ）
  const narVenuesForDay = useMemo(() => {
    if (!daySchedule || filter === "jra") return [];
    return daySchedule
      .filter((r: any) => r.organizer === "NAR" && r.raceNumber === 0)
      .map((r: any) => r.venue);
  }, [daySchedule, filter]);

  const handlePrevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateStr);
    setTimeout(() => {
      scheduleListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleVenueClick = (venue: string) => {
    const ref = venueRefs.current[venue];
    if (ref) {
      ref.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const todayStr = `${jstNow.getFullYear()}-${String(jstNow.getMonth() + 1).padStart(2, "0")}-${String(jstNow.getDate()).padStart(2, "0")}`;

  return (
    <div className="luxury-home min-h-screen">
      <Navbar />
      <main className="section-shell pt-24 pb-16 max-w-6xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Calendar className="w-7 h-7 text-[#f5dc91]" />
            <h1 className="text-2xl font-bold text-[#fff4d7]">レースカレンダー</h1>
          </div>
        </div>

        {/* フィルタータブ */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-amber-300/15 text-amber-100 border border-amber-200/50"
                : "bg-black/20 text-white/60 border border-amber-100/15 hover:bg-amber-300/10"
            }`}
          >
            すべて
          </button>
          <button
            onClick={() => setFilter("jra")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "jra"
                ? "bg-amber-300/15 text-amber-100 border border-amber-200/50"
                : "bg-black/20 text-white/60 border border-amber-100/15 hover:bg-amber-300/10"
            }`}
          >
            JRA（中央）
          </button>
          <button
            onClick={() => setFilter("nar")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "nar"
                ? "bg-amber-300/15 text-amber-100 border border-amber-200/50"
                : "bg-black/20 text-white/60 border border-amber-100/15 hover:bg-amber-300/10"
            }`}
          >
            NAR（地方）
          </button>
        </div>

        {/* カレンダー */}
        <div className="luxury-calendar-shell rounded-xl border p-6 mb-8">
          {/* 月ナビゲーション */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white">
              {year}年{month}月
            </h2>
            <button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {WEEKDAYS.map((day, i) => (
              <div key={day} className={`text-center text-xs font-medium py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-white/50"}`}>
                {day}
              </div>
            ))}
          </div>

          {/* カレンダーグリッド */}
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-white/50">読み込み中...</div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {/* 空セル */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-24 sm:h-20" />
              ))}
              {/* 日付セル */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayOfWeek = (firstDay + i) % 7;
                const info = dayInfoMap[day];
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const hasRaces = info && info.venues.length > 0;

                return (
                  <div
                    key={day}
                    onClick={() => hasRaces && handleDayClick(day)}
                    className={`h-24 sm:h-20 rounded-lg p-1 transition-all ${
                      hasRaces ? "cursor-pointer hover:bg-amber-300/10" : ""
                    } ${isSelected ? "ring-2 ring-amber-200 bg-amber-300/15" : ""} ${
                      isToday ? "bg-amber-300/10 border border-amber-200/40" : ""
                    }`}
                  >
                    <div className={`text-xs font-medium mb-0.5 ${
                      dayOfWeek === 0 ? "text-red-400" : dayOfWeek === 6 ? "text-blue-400" : "text-white/70"
                    } ${isToday ? "text-amber-200" : ""}`}>
                      {day}
                    </div>
                    {info && (
                      <div className="space-y-0.5 overflow-hidden">
                        {/* JRA競馬場 */}
                        {info.jraVenues && info.jraVenues.length > 0 && (filter === "all" || filter === "jra") && (
                          <div className="flex flex-wrap gap-0.5">
                            {info.jraVenues.slice(0, 2).map(v => (
                              <span
                                key={v}
                                onClick={(e) => { e.stopPropagation(); handleDayClick(day); setTimeout(() => handleVenueClick(v), 300); }}
                                className="text-[9px] px-1 py-0 rounded bg-emerald-500/15 text-emerald-300/80 hover:bg-emerald-500/25 cursor-pointer truncate"
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* NAR競馬場 */}
                        {info.narVenues && info.narVenues.length > 0 && (filter === "all" || filter === "nar") && (
                          <div className="flex flex-wrap gap-0.5">
                            {info.narVenues.slice(0, filter === "nar" ? 3 : 2).map(v => (
                              <span
                                key={v}
                                onClick={(e) => { e.stopPropagation(); handleDayClick(day); setTimeout(() => handleVenueClick(v), 300); }}
                                className="text-[9px] px-1 py-0 rounded bg-amber-500/15 text-amber-300/80 hover:bg-amber-500/25 cursor-pointer truncate"
                              >
                                {v}
                              </span>
                            ))}
                            {filter === "all" && info.narVenues.length > 2 && (
                              <span className="text-[9px] text-white/40">+{info.narVenues.length - 2}</span>
                            )}
                          </div>
                        )}
                        {/* グレードレース（発光エフェクト） */}
                        {info.gradeRaces.slice(0, 2).map((gr, idx) => (
                          <div
                            key={idx}
                            className={`text-[9px] px-1 py-0 rounded border truncate ${gradeBadge(gr.grade)}`}
                          >
                            <span className="font-bold">{gr.grade}</span> {gr.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 凡例 */}
        <div className="flex flex-wrap gap-4 mb-6 px-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-emerald-500/30 border border-emerald-500/50"></span>
            <span className="text-xs text-white/60">JRA（中央競馬）</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-amber-500/30 border border-amber-500/50"></span>
            <span className="text-xs text-white/60">NAR（地方競馬）</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-red-500/30 border border-red-500/50"></span>
            <span className="text-xs text-white/60">G1</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500/50"></span>
            <span className="text-xs text-white/60">G2</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-500/50"></span>
            <span className="text-xs text-white/60">G3</span>
          </div>
        </div>

        {/* 今月のグレードレース一覧 */}
        {monthData?.gradeRaces && monthData.gradeRaces.length > 0 && (
          <div className="luxury-card rounded-xl p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <h3 className="text-lg font-bold text-white">{month}月の重賞レース</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {monthData.gradeRaces.map((race, i) => (
                <div
                  key={i}
                  onClick={() => handleDayClick(parseInt(race.date.split("-")[2]!))}
                  className={`p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] ${gradeBadge(race.grade)}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold">{race.grade}</span>
                    <span className="text-sm font-medium">{race.raceName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs opacity-70">
                    <span>{race.date.split("-")[1]}/{race.date.split("-")[2]}</span>
                    <span>{race.venue}</span>
                    {race.raceNumber && <span>{race.raceNumber}R</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 選択日のスケジュールリスト */}
        {selectedDate && (
          <div ref={scheduleListRef} className="luxury-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <MapPin className="w-5 h-5 text-[#f5dc91]" />
              <h3 className="text-lg font-bold text-[#fff4d7]">
                {selectedDate.split("-")[1]}/{selectedDate.split("-")[2]}（{WEEKDAYS[new Date(selectedDate).getDay()]}）のレース
              </h3>
            </div>

            {dayLoading ? (
              <div className="h-32 flex items-center justify-center text-white/50">読み込み中...</div>
            ) : Object.keys(dayScheduleGrouped).length === 0 && narVenuesForDay.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-white/50">この日のレースデータはまだ取得されていません</div>
            ) : (
              <div className="space-y-6">
                {/* 穴狙い警報セクション */}
                {dayAlerts && dayAlerts.length > 0 && (
                  <div className="border border-orange-500/30 rounded-lg bg-gradient-to-r from-orange-500/10 to-red-500/10 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-5 h-5 text-orange-400" />
                      <h4 className="text-sm font-bold text-orange-300">穴狙い警報</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">
                        {dayAlerts.length}レース
                      </span>
                    </div>
                    <div className="space-y-2">
                      {dayAlerts.slice(0, 5).map((alert: any) => (
                        <Link
                          key={alert.raceId}
                          href={alert.organizer === "NAR" ? `/nar-predictions?date=${selectedDate}&venue=${encodeURIComponent(alert.venueName)}&race=${alert.raceNumber}` : `/predictions?date=${selectedDate}&venue=${encodeURIComponent(alert.venueName)}&race=${alert.raceNumber}`}
                          className="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                alert.alertLevel === "高" ? "bg-red-500/20 text-red-300 border border-red-500/30" :
                                alert.alertLevel === "中" ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" :
                                "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30"
                              }`}>
                                {alert.alertLevel === "高" ? "大穴警報" : alert.alertLevel === "中" ? "中穴警報" : "注意"}
                              </span>
                              <span className="text-sm font-medium text-white">
                                {alert.venueName}{alert.raceNumber}R
                              </span>
                              <span className="text-xs text-white/50">{alert.courseLabel}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs">
                            {alert.topMidOdds && (
                              <span className="text-cyan-300">
                                🚨 中穴: {alert.topMidOdds.horseName}（{alert.topMidOdds.odds}倍）
                              </span>
                            )}
                            {alert.topBomb && (
                              <span className="text-red-300">
                                💣 大穴: {alert.topBomb.horseName}（{alert.topBomb.odds}倍）
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* JRAレース詳細（個別レースデータあり） */}
                {Object.entries(dayScheduleGrouped).map(([venue, races]) => {
                  const organizer = (races as any)?.[0]?.organizer || "JRA";
                  return (
                    <div
                      key={venue}
                      ref={(el) => { venueRefs.current[venue] = el; }}
                      className="border border-white/10 rounded-lg overflow-hidden"
                    >
                      {/* 競馬場ヘッダー */}
                      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${venueBadgeColor(venue, organizer)}`}>
                            {venue}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            organizer === "NAR" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}>
                            {organizer}
                          </span>
                          <span className="text-white/50 text-xs">{races!.length}レース</span>
                        </div>
                      </div>

                      {/* レース一覧 */}
                      <div className="divide-y divide-white/5">
                        {races!.map((race) => (
                          <Link key={race.id} href={organizer === "NAR" ? `/nar-predictions?date=${selectedDate}&venue=${encodeURIComponent(venue)}&race=${race.raceNumber}` : `/predictions?date=${selectedDate}&venue=${encodeURIComponent(venue)}&race=${race.raceNumber}`} className="block px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer">
                            {/* レース番号 */}
                            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-white">{race.raceNumber}R</span>
                            </div>

                            {/* レース情報 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-sm font-medium ${race.grade ? gradeColor(race.grade) : "text-white"}`}>
                                  {race.raceName}
                                </span>
                                {race.grade && (
                                  <span className={`text-[10px] px-1.5 py-0 rounded border ${gradeBadge(race.grade)}`}>
                                    {race.grade}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-white/50">
                                {race.startTime && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {race.startTime}発走
                                  </span>
                                )}
                                {race.distance && (
                                  <span>
                                    {race.surface === "turf" ? "芝" : "ダ"}{race.distance}m
                                  </span>
                                )}
                                {race.horseCount && (
                                  <span>{race.horseCount}頭</span>
                                )}
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* NAR開催情報（個別レースデータなし、開催のみ表示） */}
                {narVenuesForDay.length > 0 && Object.keys(dayScheduleGrouped).filter(v => narVenuesForDay.includes(v)).length === 0 && (
                  <div className="border border-white/10 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/10 bg-white/5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">NAR</span>
                        <span className="text-sm text-white/70">地方競馬 本日の開催場</span>
                      </div>
                    </div>
                    <div className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {narVenuesForDay.map(venue => (
                          <a
                            key={venue}
                            href={getNarRaceListUrl(venue, selectedDate)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border cursor-pointer transition-all hover:scale-105 hover:brightness-125 flex items-center gap-1 ${narVenueBadgeColor(venue)}`}
                          >
                            {venue}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        ))}
                      </div>
                      <p className="text-xs text-white/40 mt-3">
                        ※ クリックで keiba.go.jp の出馬表・レース結果を確認できます
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
