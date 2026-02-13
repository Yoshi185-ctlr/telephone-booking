// netlify/functions/availability.js

function pad2(n) {
  return String(n).padStart(2, "0");
}

// JSTの "YYYY-MM-DD" を受け取って、その日のJST 12:00〜25:00 の枠を作る
function buildSlots(dayStr) {
  // dayStr: "2026-02-14" みたいな形式を想定
  const [y, m, d] = dayStr.split("-").map(Number);

  // JSTの 12:00 を UTC に直す：JST(UTC+9)なので -9h
  // 例) JST 12:00 → UTC 03:00
  const startUtc = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const endUtc = new Date(Date.UTC(y, m - 1, d, 16, 0, 0)); // JST 25:00 = UTC 16:00

  const slots = [];
  let cur = new Date(startUtc);

  while (cur < endUtc) {
    // 表示はJSTで hh:mm にしたい
    const jst = new Date(cur.getTime() + 9 * 60 * 60 * 1000);
    const hh = pad2(jst.getUTCHours());
    const mm = pad2(jst.getUTCMinutes());

    slots.push({
      // 予約確定に送る値はISO（UTC）
      startAt: cur.toISOString(),
      label: `${hh}:${mm}`,
    });

    // 30分刻み
    cur = new Date(cur.getTime() + 30 * 60 * 1000);
  }

  return slots;
}

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const day = qs.day;

    if (!day) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "day is required (YYYY-MM-DD)" }),
      };
    }

    // 超ゆるバリデーション
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "day must be YYYY-MM-DD" }),
      };
    }

    const slots = buildSlots(day);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e?.message || e) }),
    };
  }
};
