import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'dashboard.db');
const SOURCE_DB_PATH = '/home/jackson/.local/share/opencode/opencode.db';

let db;

if (process.env.NODE_ENV === 'production') {
  db = new Database(DB_PATH);
} else {
  if (!global.db) {
    global.db = new Database(DB_PATH);
  }
  db = global.db;
}

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    workspace_id TEXT,
    parent_id TEXT,
    slug TEXT,
    directory TEXT,
    path TEXT,
    title TEXT,
    version TEXT,
    share_url TEXT,
    summary_additions INTEGER,
    summary_deletions INTEGER,
    summary_files INTEGER,
    summary_diffs TEXT,
    metadata TEXT,
    cost REAL DEFAULT 0,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_reasoning INTEGER DEFAULT 0,
    tokens_cache_read INTEGER DEFAULT 0,
    tokens_cache_write INTEGER DEFAULT 0,
    revert TEXT,
    permission TEXT,
    agent TEXT,
    model TEXT,
    time_created INTEGER,
    time_updated INTEGER,
    time_compacting INTEGER,
    time_archived INTEGER
  );

  CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    time_created INTEGER,
    role TEXT,
    cost REAL DEFAULT 0,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_reasoning INTEGER DEFAULT 0,
    tokens_cache_read INTEGER DEFAULT 0,
    tokens_cache_write INTEGER DEFAULT 0,
    model_id TEXT,
    provider_id TEXT,
    agent TEXT,
    session_title TEXT,
    session_directory TEXT,
    session_project_id TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    status TEXT,
    records_synced INTEGER,
    error TEXT
  );
`);

export function getDb() {
  return db;
}

export function getLastSync() {
  try {
    const row = db.prepare('SELECT * FROM sync_history ORDER BY id DESC LIMIT 1').get();
    return row || null;
  } catch (error) {
    console.error('Failed to get last sync:', error);
    return null;
  }
}

export function syncData() {
  // Check if source DB exists
  if (!fs.existsSync(SOURCE_DB_PATH)) {
    const errorMsg = `源数据库文件不存在: ${SOURCE_DB_PATH}`;
    db.prepare('INSERT INTO sync_history (timestamp, status, records_synced, error) VALUES (?, ?, ?, ?)')
      .run(Date.now(), 'failed', 0, errorMsg);
    throw new Error(errorMsg);
  }

  let sourceDb;
  try {
    sourceDb = new Database(SOURCE_DB_PATH, { readonly: true });
  } catch (error) {
    console.error('Failed to open source database:', error);
    db.prepare('INSERT INTO sync_history (timestamp, status, records_synced, error) VALUES (?, ?, ?, ?)')
      .run(Date.now(), 'failed', 0, error.message);
    throw new Error('无法读取opencode.db: ' + error.message);
  }

  // opencode v2 存储结构：会话在 session_v2，消息在 session_message
  // 统计一次会话中 edit/write 的增删行数与涉及文件数
  function computeSessionStats(sourceDb, sessionId) {
    const files = new Set();
    let additions = 0;
    let deletions = 0;

    const msgs = sourceDb.prepare(
      "SELECT data FROM session_message WHERE session_id = ? AND type = 'assistant'"
    ).all(sessionId);

    const getFile = (input) => input?.filePath || input?.path;

    const countEdit = (input) => {
      if (!input) return;
      const file = getFile(input);
      if (file) files.add(file);
      const oldText = input.oldString || '';
      const newText = input.newString || '';
      if (!oldText && !newText) return;
      const oldLines = oldText ? oldText.split('\n') : [];
      const newLines = newText ? newText.split('\n') : [];
      const oldSet = new Set(oldLines);
      const newSet = new Set(newLines);
      for (const line of newLines) {
        if (!oldSet.has(line)) additions++;
      }
      for (const line of oldLines) {
        if (!newSet.has(line)) deletions++;
      }
    };

    const countWrite = (input) => {
      if (!input) return;
      const file = getFile(input);
      if (file) files.add(file);
      const content = input.content || '';
      if (content) additions += content.split('\n').length;
    };

    for (const msg of msgs) {
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch {
        continue;
      }
      const content = Array.isArray(data.content) ? data.content : [];
      for (const part of content) {
        if (!part) continue;
        if (part.type === 'patch' && Array.isArray(part.files)) {
          part.files.forEach(f => files.add(f));
          continue;
        }
        if (part.type !== 'tool') continue;
        const toolName = part.name || part.tool;
        const input = part.state?.input;
        const completed = part.state?.status === 'completed';
        if (!completed) {
          if (toolName === 'edit' || toolName === 'write') {
            const file = getFile(input);
            if (file) files.add(file);
          }
          continue;
        }
        if (toolName === 'edit') countEdit(input);
        else if (toolName === 'write') countWrite(input);
      }
    }

    return { summary_additions: additions, summary_deletions: deletions, summary_files: files.size };
  }

  try {
    const sessions = sourceDb.prepare('SELECT * FROM session_v2').all();

    for (const session of sessions) {
      const stats = computeSessionStats(sourceDb, session.id);
      session.summary_additions = stats.summary_additions;
      session.summary_deletions = stats.summary_deletions;
      session.summary_files = stats.summary_files;
    }

    const insert = db.prepare(`
      INSERT OR REPLACE INTO session (
        id, project_id, workspace_id, parent_id, slug, directory, path, title, version,
        share_url, summary_additions, summary_deletions, summary_files, summary_diffs,
        metadata, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read,
        tokens_cache_write, revert, permission, agent, model, time_created, time_updated,
        time_compacting, time_archived
      ) VALUES (
        @id, @project_id, @workspace_id, @parent_id, @slug, @directory, @path, @title, @version,
        @share_url, @summary_additions, @summary_deletions, @summary_files, @summary_diffs,
        @metadata, @cost, @tokens_input, @tokens_output, @tokens_reasoning, @tokens_cache_read,
        @tokens_cache_write, @revert, @permission, @agent, @model, @time_created, @time_updated,
        @time_compacting, @time_archived
      )
    `);

    const transaction = db.transaction((rows) => {
      let count = 0;
      for (const row of rows) {
        insert.run(row);
        count++;
      }
      return count;
    });

    const syncedCount = transaction(sessions);

    // === Sync message table ===
    const messages = sourceDb.prepare(`
      SELECT sm.id, sm.session_id, sm.time_created, sm.type, sm.data,
             s.title as session_title, s.directory as session_directory, s.project_id as session_project_id
      FROM session_message sm
      JOIN session_v2 s ON s.id = sm.session_id
      ORDER BY sm.time_created
    `).all();

    const insertMsg = db.prepare(`
      INSERT OR REPLACE INTO message (
        id, session_id, time_created, role, cost,
        tokens_input, tokens_output, tokens_reasoning,
        tokens_cache_read, tokens_cache_write,
        model_id, provider_id, agent,
        session_title, session_directory, session_project_id
      ) VALUES (
        @id, @session_id, @time_created, @role, @cost,
        @tokens_input, @tokens_output, @tokens_reasoning,
        @tokens_cache_read, @tokens_cache_write,
        @model_id, @provider_id, @agent,
        @session_title, @session_directory, @session_project_id
      )
    `);

    const msgTransaction = db.transaction((rows) => {
      let count = 0;
      for (const row of rows) {
        const d = JSON.parse(row.data);
        insertMsg.run({
          id: row.id,
          session_id: row.session_id,
          time_created: row.time_created,
          role: d.role || row.type || '',
          cost: d.cost || 0,
          tokens_input: d.tokens?.input || 0,
          tokens_output: d.tokens?.output || 0,
          tokens_reasoning: d.tokens?.reasoning || 0,
          tokens_cache_read: d.tokens?.cache?.read || 0,
          tokens_cache_write: d.tokens?.cache?.write || 0,
          model_id: d.modelID || d.model?.id || '',
          provider_id: d.providerID || d.model?.providerID || '',
          agent: d.agent || '',
          session_title: row.session_title || '',
          session_directory: row.session_directory || '',
          session_project_id: row.session_project_id || ''
        });
        count++;
      }
      return count;
    });

    const msgSyncedCount = msgTransaction(messages);
    
    db.prepare('INSERT INTO sync_history (timestamp, status, records_synced) VALUES (?, ?, ?)')
      .run(Date.now(), 'success', syncedCount + msgSyncedCount);

    return {
      success: true,
      syncedCount: syncedCount + msgSyncedCount,
      msgSyncedCount,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Sync failed:', error);
    db.prepare('INSERT INTO sync_history (timestamp, status, records_synced, error) VALUES (?, ?, ?, ?)')
      .run(Date.now(), 'failed', 0, error.message);
    throw error;
  } finally {
    if (sourceDb) {
      sourceDb.close();
    }
  }
}
