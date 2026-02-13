const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    const day = (event.queryStringParameters && event.queryStringParameters.day) || null;
    if (!day) return json(400, { error: 'day is required (YYYY-MM-DD)' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // JST 12:00 = UTC 03:00
    const startUtc = new Date(`${day}T03:00:00.000Z`);

    // JST 翌5:00 = UTC 20:00（同日）
    const dayObj = new Date(`${day}T00:00:00.000Z`);
    const endUtc = new Date(dayObj.getTime() + 24 * 60 * 60 * 1000);
    endUtc.setUTCHours(20, 0, 0, 0);

    const { data: booked, error } = await supabase
      .from('phone_bookings')
      .select('start_at')
      .gte('start_at', startUtc.toISOString())
      .lt('start_at', endUtc.toISOString());

    if (error) throw error;

    const bookedSet = new Set((booked || []).map(r => new Date(r.start_at).toISOString()));

    const slots = [];
    const stepMs = 30 * 60 * 1000; // 30分刻み

    for (let t = startUtc.getTime(); t < endUtc.getTime(); t += stepMs) {
      const startAt = new Date(t);

      // 表示用（JST）
      const jst = new Date(startAt.getTime() + 9 * 60 * 60 * 1000);
      const hh = String(jst.getHours()).padStart(2, '0');
      const mm = String(jst.getMinutes()).padStart(2, '0');

      const available =
        startAt.getTime() > Date.now() && !bookedSet.has(startAt.toISOString());

      slots.push({
        startAt: startAt.toISOString(),
        label: `${hh}:${mm}`,
        available
      });
    }

    return json(200, { day, slots });
  } catch (e) {
    return json(500, { error: 'server error' });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body),
  };
}
