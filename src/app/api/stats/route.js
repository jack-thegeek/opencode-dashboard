import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '2h';
  const type = searchParams.get('type') || 'message';
  const dateParam = searchParams.get('date');

  try {
    const db = getDb();

    const now = Date.now();

    let startTime;
    let endTime = now;
    const isDateMode = !!dateParam;
    if (isDateMode) {
      // Manual date selection (YYYY-MM-DD): whole local day
      const parts = dateParam.split('-').map(Number);
      const dayStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
      startTime = dayStart;
      endTime = dayStart + 24 * 60 * 60 * 1000 - 1;
    } else {
      switch (range) {
        case '15m':
          startTime = now - 15 * 60 * 1000;
          break;
        case '30m':
          startTime = now - 30 * 60 * 1000;
          break;
        case '1h':
          startTime = now - 60 * 60 * 1000;
          break;
        case '6h':
          startTime = now - 6 * 60 * 60 * 1000;
          break;
        case 'day':
          startTime = now - 24 * 60 * 60 * 1000;
          break;
        case '7d':
          startTime = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case '30d':
          startTime = now - 30 * 24 * 60 * 60 * 1000;
          break;
        case '2h':
        default:
          startTime = now - 2 * 60 * 60 * 1000;
          break;
      }
    }

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalReasoningTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let formattedLogs = [];
    let dbTotalStats = {};

    const parseModelField = (val) => {
      if (!val) return { model: 'unknown', provider: '' };
      try {
        const parsed = JSON.parse(val);
        return { model: parsed.id || 'unknown', provider: parsed.providerID || '' };
      } catch {
        return { model: val, provider: '' };
      }
    };

    const calcCacheHitRate = (input, read, write) => {
      const r = read || 0;
      const w = write || 0;
      const i = input || 0;
      const total = r + w + i;
      if (total <= 0) return null;
      return Math.round((r / total) * 1000) / 1000;
    };

    if (type === 'session') {
      // Session-level queries
      const sessions = db.prepare(`
        SELECT s.*,
          (SELECT provider_id FROM message WHERE session_id = s.id AND provider_id != '' LIMIT 1) as provider_id
        FROM session s
        WHERE s.time_updated >= ? AND s.time_updated <= ?
        ORDER BY s.time_updated DESC
      `).all(startTime, endTime);

      const totalRow = db.prepare(`
        SELECT COUNT(*) as cnt,
               COALESCE(SUM(cost), 0) as cost,
               COALESCE(SUM(tokens_input), 0) as ti,
               COALESCE(SUM(tokens_output), 0) as to_
        FROM session
      `).get();
      dbTotalStats = {
        count: totalRow ? totalRow.cnt : 0,
        cost: totalRow ? totalRow.cost : 0,
        tokens_input: totalRow ? totalRow.ti : 0,
        tokens_output: totalRow ? totalRow.to_ : 0
      };

      for (const s of sessions) {
        totalCost += s.cost;
        totalInputTokens += s.tokens_input;
        totalOutputTokens += s.tokens_output;
        totalReasoningTokens += s.tokens_reasoning;
        totalCacheReadTokens += s.tokens_cache_read || 0;
        totalCacheWriteTokens += s.tokens_cache_write || 0;

        const parsed = parseModelField(s.model);
        let providerVal = s.provider_id || '';
        if (!providerVal) {
          try {
            const p = JSON.parse(s.model);
            providerVal = p.providerID || '';
          } catch {}
        }

        formattedLogs.push({
          id: s.id,
          session_id: s.id,
          title: s.title || 'Untitled',
          directory: s.directory || '',
          project_id: s.project_id || '',
          cost: s.cost,
          tokens_input: s.tokens_input,
          tokens_output: s.tokens_output,
          tokens_reasoning: s.tokens_reasoning,
          tokens_cache_read: s.tokens_cache_read || 0,
          tokens_cache_write: s.tokens_cache_write || 0,
          cache_hit_rate: calcCacheHitRate(s.tokens_input, s.tokens_cache_read, s.tokens_cache_write),
          duration: (s.time_updated || 0) - (s.time_created || 0),
          model: parsed.model,
          provider: providerVal,
          role: 'session',
          agent: s.agent || '',
          time_created: s.time_updated
        });
      }
    } else {
      // Message-level queries (original)
      const messages = db.prepare(`
        SELECT m.*
        FROM message m
        WHERE role = 'assistant' AND m.time_created >= ? AND m.time_created <= ?
        ORDER BY m.time_created DESC
      `).all(startTime, endTime);

      const totalRow = db.prepare(`
        SELECT COUNT(*) as cnt,
               COALESCE(SUM(cost), 0) as cost,
               COALESCE(SUM(tokens_input), 0) as ti,
               COALESCE(SUM(tokens_output), 0) as to_
        FROM message WHERE role = 'assistant'
      `).get();
      dbTotalStats = {
        count: totalRow ? totalRow.cnt : 0,
        cost: totalRow ? totalRow.cost : 0,
        tokens_input: totalRow ? totalRow.ti : 0,
        tokens_output: totalRow ? totalRow.to_ : 0
      };

      for (const msg of messages) {
        totalCost += msg.cost;
        totalInputTokens += msg.tokens_input;
        totalOutputTokens += msg.tokens_output;
        totalReasoningTokens += msg.tokens_reasoning;
        totalCacheReadTokens += msg.tokens_cache_read || 0;
        totalCacheWriteTokens += msg.tokens_cache_write || 0;

        const modelId = msg.model_id || 'unknown';
        const providerId = msg.provider_id || 'unknown';

        formattedLogs.push({
          id: msg.id,
          session_id: msg.session_id,
          title: msg.session_title || 'Untitled',
          directory: msg.session_directory || '',
          project_id: msg.session_project_id || '',
          cost: msg.cost,
          tokens_input: msg.tokens_input,
          tokens_output: msg.tokens_output,
          tokens_reasoning: msg.tokens_reasoning,
          tokens_cache_read: msg.tokens_cache_read || 0,
          tokens_cache_write: msg.tokens_cache_write || 0,
          cache_hit_rate: calcCacheHitRate(msg.tokens_input, msg.tokens_cache_read, msg.tokens_cache_write),
          duration: (msg.time_updated || 0) - (msg.time_created || 0),
          model: modelId,
          provider: providerId,
          role: msg.role,
          agent: msg.agent,
          time_created: msg.time_created
        });
      }
    }

    // Compute time-series chart data (shared logic)
    const bucketSizes = {
      '30m': 2 * 60 * 1000,
      '1h': 5 * 60 * 1000,
      '2h': 5 * 60 * 1000,
      '6h': 15 * 60 * 1000,
      '7d': 24 * 60 * 60 * 1000,
      '30d': 24 * 60 * 60 * 1000
    };
    const bucketSize = isDateMode ? 60 * 60 * 1000 : (bucketSizes[range] || 5 * 60 * 1000);
    const bucketMap = new Map();

    const timeField = type === 'session' ? 'time_updated' : 'time_created';
    const sourceTable = type === 'session' ? 'session' : 'message';
    const roleFilter = type === 'session' ? '' : "WHERE role = 'assistant' AND ";
    const roleWhere = type === 'session' ? 'WHERE' : '';

    const ascRows = db.prepare(`
      SELECT ${timeField} as ts, tokens_input, tokens_output, tokens_reasoning, cost
      FROM ${sourceTable}
      ${roleFilter}${roleWhere} ${timeField} >= ? AND ${timeField} <= ?
      ORDER BY ${timeField} ASC
    `).all(startTime, endTime);

    const isDaily = !isDateMode && (range === '7d' || range === '30d');

    for (const row of ascRows) {
      let bucketStart;
      if (isDaily) {
        const date = new Date(row.ts);
        date.setHours(0, 0, 0, 0);
        bucketStart = date.getTime();
      } else {
        bucketStart = Math.floor(row.ts / bucketSize) * bucketSize;
      }

      if (!bucketMap.has(bucketStart)) {
        bucketMap.set(bucketStart, { time: bucketStart, input: 0, output: 0, reasoning: 0, cost: 0, count: 0 });
      }
      const b = bucketMap.get(bucketStart);
      b.input += row.tokens_input;
      b.output += row.tokens_output;
      b.reasoning += row.tokens_reasoning;
      b.cost += row.cost;
      b.count += 1;
    }

    const chartData = Array.from(bucketMap.values()).sort((a, b) => a.time - b.time);

    return NextResponse.json({
      success: true,
      type,
      summary: {
        totalCost: parseFloat(totalCost.toFixed(6)),
        totalInputTokens,
        totalOutputTokens,
        totalReasoningTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        count: formattedLogs.length,
        averageCost: formattedLogs.length > 0 ? parseFloat((totalCost / formattedLogs.length).toFixed(6)) : 0,
        averageTokens: formattedLogs.length > 0 ? Math.round((totalInputTokens + totalOutputTokens) / formattedLogs.length) : 0,
      },
      chartData,
      logs: formattedLogs,
      dbTotalStats,
      referenceTime: now,
      startTime
    });

  } catch (error) {
    console.error('Failed to get stats:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}