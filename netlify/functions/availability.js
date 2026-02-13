// netlify/functions/availability.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// JST基準の予約枠：12:00〜翌05:00（30分刻み）
const SLOT_MINUTES = 30;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function hhmmlabelFromJstDate(dJst) {
  const hh = pad2(dJst.getHours());
  const mm = pad2(dJst.getMinutes());
  return `${hh}:${mm}`;
}

// dayStr: "YYYY-MM-DD"（JSTの日付）
// その日の 12:00 JST = 03:00 UTC
// その日の 翌05:00 JST = 20:00 UTC（同日UTC）
function makeUtcRangeForDay(dayStr) {
  const m = dayStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  // 12:00 JST = 03:00 UTC
  const startUtc = new Date(Date.UTC(y, mo - 1, d, 3, 0, 0));
  // 翌05:00 JST = 20:00 UTC
  const endUtc = new Date(Date.UTC(y, mo - 1, d, 20, 0, 0));

  return { startUtc, endUtc };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

exports.handler = async (event) => {
  try {
    const dayStr = event.queryStringParameters?.day;
    if (!dayStr) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'day is required (YYYY-MM-DD)' }),
      };
    }

    const range = makeUtcRangeForDay(dayStr);
    if (!range) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'invalid day format' }),
      };
    }

    const { startUtc, endUtc } = range;

    // 予約済み start_at を取得（UTCで保存されてる前提）
    const { data: booked, error } = await supabase
      .from('phone_bookings')
      .select('start_at')
      .gte('start_at', startUtc.toISOString())
      .lt('start_at', endUtc.toISOString());

    if (error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
      };
    }

    const bookedSet = new Set((booked || []).map((r) => r.start_at));

    // 30分刻みの枠を生成（UTCで start_at を作る）
    const slots = [];
    for (let t = new Date(startUtc); t < endUtc; t = addMinutes(t, SLOT_MINUTES)) {
      const iso = t.toISOString();
      if (bookedSet.has(iso)) continue;

      // 表示用はJST(UTC+9)の時刻ラベルにする
      const tJst = new Date(t.getTime() + 9 * 60 * 60 * 1000);
      slots.push({
        start_at: iso,
        label: hhmmlabelFromJstDate(tJst),
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'server error' }),
    };
  }
};
