"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw, Database, Activity, Coins, DollarSign,
  Clock, Search, SlidersHorizontal,
  AlertCircle, CheckCircle2, Terminal, Folder, FileText, Timer, TrendingUp,
  Sun, Moon, Calendar
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const formatTokens = (n) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString();

  // Filter states
  const [range, setRange] = useState('2h');
  const [selectedDate, setSelectedDate] = useState('');
  const [logType, setLogType] = useState('session');

  // Data states
  const [statsData, setStatsData] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncMessage, setSyncMessage] = useState(null);

  // Search and filter logs
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Auto sync
  const [autoSyncInterval, setAutoSyncInterval] = useState(10000);
  const intervalRef = useRef(null);
  const handleAutoSyncRef = useRef();
  const lastSyncedCountRef = useRef(null);

  useEffect(() => {
    fetchLastSync();
    fetchStats();
    handleSync();
  }, []);

  useEffect(() => {
    fetchStats();
    setModelFilter('all');
  }, [range, selectedDate, logType]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, modelFilter]);

  const fetchLastSync = async () => {
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      if (data.lastSync) {
        setLastSync(data.lastSync);
      }
    } catch (e) {
      console.error("Failed to fetch last sync info", e);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const dateQuery = selectedDate ? `&date=${selectedDate}` : '';
      const res = await fetch(`/api/stats?range=${range}&type=${logType}${dateQuery}`);
      const data = await res.json();
      if (data.success) {
        setStatsData(data);
      } else {
        setError(data.error || '获取统计数据失败');
        setStatsData(null);
      }
    } catch (e) {
      setError('无法连接服务器，请检查后端服务。');
      setStatsData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncMessage({
          type: 'success',
          text: `同步成功！已同步 ${data.syncedCount} 条记录。`
        });
        await fetchLastSync();
        await fetchStats();
      } else {
        setSyncMessage({
          type: 'error',
          text: `同步失败: ${data.error}`
        });
      }
    } catch (e) {
      setSyncMessage({
        type: 'error',
        text: '同步请求失败，请稍后重试。'
      });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  }, []);

  const handleAutoSync = async () => {
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const prev = lastSyncedCountRef.current;
        const curr = data.syncedCount;
        if (prev !== null && curr === prev) return;
        lastSyncedCountRef.current = curr;
        await fetchLastSync();
        await fetchStats();
      }
    } catch (e) {
      console.error('Auto sync failed:', e);
    }
  };

  handleAutoSyncRef.current = handleAutoSync;

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoSyncInterval) {
      intervalRef.current = setInterval(() => {
        handleAutoSyncRef.current();
      }, autoSyncInterval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoSyncInterval]);

  // Format date helper
  const formatDate = (ms) => {
    if (!ms) return '-';
    const date = new Date(ms);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '-';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes + 'm ' + secs + 's';
  };

  // Format sync relative time
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return '从未同步';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
  };

  // Filtered Logs
  const getFilteredLogs = () => {
    if (!statsData || !statsData.logs) return [];
    return statsData.logs.filter(log => {
      const matchSearch =
        log.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.directory.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.session_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.role || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchModel = modelFilter === 'all' || (log.model && log.model === modelFilter);

      return matchSearch && matchModel;
    });
  };

  const filteredLogs = getFilteredLogs();
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedLogs = filteredLogs.slice((safePage - 1) * pageSize, safePage * pageSize);

  // All models for dropdown
  const getUniqueModels = () => {
    if (!statsData || !statsData.logs) return [];
    const models = statsData.logs.map(log => log.model).filter(Boolean);
    return [...new Set(models)];
  };

  const uniqueModels = getUniqueModels();

  return (
    <div className="dashboard-container animate-fade-in">
      {/* Top Header */}
      <header className="glass-card flex-row-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <div className="flex-center" style={{ gap: '0.5rem', marginBottom: '0.25rem' }}>
            <Terminal size={24} className="text-primary" style={{ color: 'var(--color-primary)' }} />
            <h1 className="title-gradient" style={{ fontSize: '1.5rem', margin: 0 }}>CC-Switch Analytics</h1>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            数据来源: <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>/home/jackson/.local/share/opencode/opencode.db</code>
          </p>
        </div>

        {/* Sync Controls */}
        <div className="flex-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
          {lastSync && (
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <div>上次同步: {formatDate(lastSync.timestamp)}</div>
              <div style={{ color: lastSync.status === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                状态: {lastSync.status === 'success' ? `成功 (+${lastSync.records_synced}条)` : '失败'}
              </div>
            </div>
          )}
          <div className="flex-center" style={{ gap: '0.5rem' }}>
            {autoSyncInterval && (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--color-success)',
                animation: 'pulse-glow 2s infinite',
                flexShrink: 0
              }} />
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>自动:</span>
            <div className="flex-center" style={{ gap: '0.25rem', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              {[
                { value: null, label: '关' },
                { value: 5000, label: '5s' },
                { value: 10000, label: '10s' },
                { value: 30000, label: '30s' },
              ].map(opt => (
                <button
                  key={opt.label}
                  className={`btn btn-secondary ${autoSyncInterval === opt.value ? 'active' : ''}`}
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                  onClick={() => setAutoSyncInterval(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
            style={{ width: '36px', height: '36px' }}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncing}
            style={{ minWidth: '130px' }}
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? '同步中...' : '同步数据'}
          </button>
        </div>
      </header>

      {/* Sync Toast */}
      {syncMessage && (
        <div style={{
          position: 'fixed', top: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.875rem 1.25rem',
          background: 'var(--bg-surface-glass)',
          backdropFilter: 'blur(16px)',
          border: `1px solid var(--color-${syncMessage.type})`,
          borderLeft: `4px solid var(--color-${syncMessage.type})`,
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          animation: 'slideDown 0.25s ease-out forwards',
          maxWidth: '420px',
        }}>
          {syncMessage.type === 'success' ? (
            <CheckCircle2 size={20} color="var(--color-success)" />
          ) : (
            <AlertCircle size={20} color="var(--color-danger)" />
          )}
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {syncMessage.text}
          </span>
        </div>
      )}

      {/* Dashboard Filter Bar */}
      <section className="glass-card filter-row">
        <div className="flex-center" style={{ gap: '0.5rem' }}>
          <Clock size={16} style={{ color: 'var(--text-primary)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>时间范围:</span>
          <div className="flex-center" style={{ gap: '0.25rem', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button
              className={`btn btn-secondary ${range === '30m' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setRange('30m')}
            >
              30分钟
            </button>
            <button
              className={`btn btn-secondary ${range === '1h' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setRange('1h')}
            >
              1小时
            </button>
            <button
              className={`btn btn-secondary ${range === '2h' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setRange('2h')}
            >
              2小时
            </button>
            <button
              className={`btn btn-secondary ${range === '6h' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setRange('6h')}
            >
              6小时
            </button>
            <button
              className={`btn btn-secondary ${range === '7d' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setRange('7d')}
            >
              7天
            </button>
            <button
              className={`btn btn-secondary ${range === '30d' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setRange('30d')}
            >
              30天
            </button>
          </div>
          <div className="flex-center" style={{ gap: '0.5rem' }}>
            <Calendar size={16} style={{ color: 'var(--text-primary)' }} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
            />
            {selectedDate && (
              <button
                className="btn btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                onClick={() => setSelectedDate('')}
              >
                清除
              </button>
            )}
          </div>
        </div>

        <div className="flex-center" style={{ gap: '0.5rem' }}>
          <FileText size={16} style={{ color: 'var(--text-primary)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>粒度:</span>
          <div className="flex-center" style={{ gap: '0.25rem', background: 'rgba(255,255,255,0.03)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button
              className={`btn btn-secondary ${logType === 'message' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setLogType('message')}
            >
              消息级
            </button>
            <button
              className={`btn btn-secondary ${logType === 'session' ? 'active' : ''}`}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              onClick={() => setLogType('session')}
            >
              会话级
            </button>
          </div>
        </div>
      </section>

      {/* Loading State */}
      {loading && !statsData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="glass-card shimmer-bg" style={{ height: '110px' }} />
            ))}
          </div>
          <div className="grid-main">
            <div className="glass-card shimmer-bg" style={{ height: '350px' }} />
            <div className="glass-card shimmer-bg" style={{ height: '350px' }} />
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="glass-card text-center" style={{ padding: '3rem 1.5rem', borderColor: 'var(--color-danger)' }}>
          <AlertCircle size={48} className="text-danger" style={{ color: 'var(--color-danger)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>出错了</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
          <button className="btn btn-primary" onClick={fetchStats}>重试</button>
        </div>
      )}

      {/* Dashboard Data Display */}
      {statsData && !error && (
        <div style={{
          opacity: loading ? 0.6 : 1,
          transition: 'opacity 0.15s ease',
          pointerEvents: loading ? 'none' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}>
          {/* Key Metrics Grid */}
          <section className="grid-cols-4">
            {/* Total Tokens Card */}
            <div className="glass-card stat-card" style={{ '--accent-line-color': 'var(--color-primary)' }}>
              <div className="stat-label">
                <Coins size={16} style={{ color: 'var(--color-primary)' }} />
                <span>总 Token 消耗</span>
              </div>
              <div className="stat-value">
                {formatTokens(statsData.summary.totalTokens)}
              </div>
              <div className="stat-desc">
                <span style={{ color: 'var(--color-success)' }}>In: {formatTokens(statsData.summary.totalInputTokens)}</span>
                <span>/</span>
                <span style={{ color: 'var(--color-info)' }}>Out: {formatTokens(statsData.summary.totalOutputTokens)}</span>
              </div>
            </div>

            {/* Messages Count Card */}
            <div className="glass-card stat-card" style={{ '--accent-line-color': 'var(--color-success)' }}>
              <div className="stat-label">
                <Activity size={16} style={{ color: 'var(--color-success)' }} />
                <span>{statsData.type === 'session' ? '会话数' : '消息交互数'}</span>
              </div>
              <div className="stat-value" style={{ color: 'var(--color-success)' }}>
                {statsData.summary.count}
              </div>
              <div className="stat-desc">
                <span>总计记录: {statsData.dbTotalStats.count} 条</span>
              </div>
            </div>

            {/* Avg Card */}
            <div className="glass-card stat-card" style={{ '--accent-line-color': 'var(--color-warning)' }}>
              <div className="stat-label">
                <SlidersHorizontal size={16} style={{ color: 'var(--color-warning)' }} />
                <span>次均消耗</span>
              </div>
              <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
                {formatTokens(statsData.summary.averageTokens)} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>tkn</span>
              </div>
              <div className="stat-desc">
                <span>次均花费: ${statsData.summary.averageCost.toFixed(5)}</span>
              </div>
            </div>
          </section>

          {/* Token Consumption Chart */}
          {statsData.chartData && statsData.chartData.length > 0 && (
            <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={18} style={{ color: 'var(--color-primary)' }} />
                  <span>Token 消耗趋势</span>
                </h2>
                <div className="flex-center" style={{ gap: '1rem', fontSize: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '2px', background: 'var(--color-success)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>输入</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '2px', background: 'var(--color-info)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>输出</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '2px', background: 'var(--color-purple)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>总计</span>
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={statsData.chartData.map(d => {
                  const date = new Date(d.time);
                  const isDaily = range === '7d' || range === '30d';
                  const timeStr = isDaily 
                    ? date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
                    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                  return {
                    ...d,
                    time: timeStr,
                    total: d.input + d.output
                  };
                })}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-color)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-color)' }}
                    tickFormatter={(v) => formatTokens(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-surface-glass)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      backdropFilter: 'blur(8px)',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)'
                    }}
                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.375rem' }}
                    itemStyle={{ color: 'var(--text-secondary)' }}
                    formatter={(value, name) => {
                      const labels = { input: '输入 Token', output: '输出 Token', total: '总 Token' };
                      return [formatTokens(value), labels[name] || name];
                    }}
                  />
                  <Line type="monotone" dataKey="input" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
                  <Line type="monotone" dataKey="output" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#06b6d4' }} />
                  <Line type="monotone" dataKey="total" stroke="#a855f7" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: '#a855f7' }} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          {/* Logs Table Section */}
          <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Terminal size={18} style={{ color: 'var(--color-primary)' }} />
                <span>请求日志 ({filteredLogs.length} 条{statsData?.type === 'session' ? '会话' : '消息'})</span>
              </h2>

              {/* Filters search */}
              <div className="flex-center" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="搜索消息/会话名..."
                    className="input-text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ paddingLeft: '2rem', fontSize: '0.75rem', width: '200px', height: '32px', paddingTop: '0', paddingBottom: '0' }}
                  />
                </div>

                {/* Model dropdown - shadcn Select */}
                <Select value={modelFilter} onValueChange={setModelFilter}>
                  <SelectTrigger className="w-[200px] h-8 text-xs">
                    <SelectValue placeholder="所有模型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">所有模型</SelectItem>
                    {uniqueModels.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>会话</th>
                    <th>使用模型</th>
                    <th>推理 Token</th>
                    <th>输入 Token</th>
                    <th>输出 Token</th>
                    <th>缓存读</th>
                    <th>缓存命中率</th>
                    <th>用时</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0' }}>
                        没有找到符合条件的消息日志
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map(log => {
                      return (
                        <tr key={log.id} className="row-interactive">
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                            {formatDate(log.time_created)}
                          </td>
                            <td style={{ width: '400px', maxWidth: '400px', minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                  {log.title}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                <Folder size={12} style={{ flexShrink: 0 }} />
                                <span style={{ fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.directory}</span>
                              </div>
                            </td>
                            <td>
                              <div className="badge badge-primary" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                                {log.model}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', marginLeft: '4px' }}>
                                {log.provider}
                              </div>
                            </td>
                            <td style={{ color: 'var(--color-info)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                              {formatTokens(log.tokens_reasoning)}
                            </td>
                            <td style={{ color: 'var(--color-success)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                              {formatTokens(log.tokens_input)}
                            </td>
                            <td style={{ color: 'var(--color-info)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                              {formatTokens(log.tokens_output)}
                            </td>
                            <td style={{ color: 'var(--color-success)', fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                              {formatTokens(log.tokens_cache_read)}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 500 }}>
                              {log.cache_hit_rate == null ? (
                                <span style={{ color: 'var(--text-muted)' }}>-</span>
                              ) : (
                                <span style={{ color: log.cache_hit_rate >= 0.5 ? 'var(--color-success)' : (log.cache_hit_rate > 0 ? 'var(--color-warning)' : 'var(--text-muted)') }}>
                                  {(log.cache_hit_rate * 100).toFixed(1)}%
                                </span>
                              )}
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                              {formatDuration(log.duration)}
                            </td>
                          </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0 0' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  共 {filteredLogs.length} 条，第 {safePage}/{totalPages} 页
                </span>
                <div className="flex-center" style={{ gap: '0.25rem' }}>
                  <button
                    className="btn btn-secondary"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    上一页
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                    .reduce((acc, p, idx, arr) => {
                      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} style={{ padding: '0 0.3rem', color: 'var(--text-muted)' }}>...</span>
                      ) : (
                        <button
                          key={p}
                          className={`btn btn-secondary ${safePage === p ? 'active' : ''}`}
                          onClick={() => setPage(p)}
                          style={{ padding: '0.4rem 0.65rem', fontSize: '0.75rem', minWidth: '32px' }}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    className="btn btn-secondary"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}