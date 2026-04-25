'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PIE_COLORS = ['#8DB88A', '#E07A5F', '#C9A84C', '#9B8EC4'];

export default function AnalyticsPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/projects/${id}/progress`).then((res) => setData(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  const pieData = [
    { name: 'To Do',       value: data?.todo        || 0 },
    { name: 'In Progress', value: data?.in_progress || 0 },
    { name: 'Done',        value: data?.done        || 0 },
  ].filter((d) => d.value > 0);

  // Simulated bar chart — tasks shipped vs opened per day
  const barData = DAYS.map((day) => ({
    day,
    Opened:  Math.round(Math.random() * 10 + 4),
    Shipped: Math.round(Math.random() * 8 + 2),
  }));

  const kpis = [
    { label: 'Completion rate',  value: `${data?.percent || 0}%`, sub: 'Q2 target',          icon: '🎯', bg: 'var(--bloom-green-bg)',  color: '#4a8a46' },
    { label: 'Tasks completed',  value: data?.done || 0,           sub: 'out of ' + (data?.total || 0),  icon: '✅', bg: 'var(--bloom-coral-bg)',  color: 'var(--bloom-coral)' },
    { label: 'Open tasks',       value: (data?.total || 0) - (data?.done || 0), sub: 'remaining', icon: '📋', bg: 'var(--bloom-yellow-bg)', color: 'var(--bloom-yellow)' },
    { label: 'Avg cycle time',   value: '3.2d', sub: 'from open → done',         icon: '⏱', bg: 'var(--bloom-purple-bg)', color: 'var(--bloom-purple)' },
  ];

  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="bloom-card p-5">
              <div className="stat-icon mb-3" style={{ background: k.bg }}>
                <span>{k.icon}</span>
              </div>
              <div className="text-3xl font-bold font-serif mb-0.5" style={{ color: 'var(--bloom-text)' }}>{k.value}</div>
              <div className="text-sm font-medium" style={{ color: 'var(--bloom-text)' }}>{k.label}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--bloom-muted)' }}>· {k.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Bar chart – tasks shipped vs opened */}
          <div className="lg:col-span-2 bloom-card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-serif text-lg font-bold" style={{ color: 'var(--bloom-text)' }}>Tasks shipped vs opened</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--bloom-muted)' }}>Last 7 days</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bloom-border)" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bloom-surface)', border: '1px solid var(--bloom-border)', borderRadius: 10 }}
                    itemStyle={{ color: 'var(--bloom-text)' }}
                  />
                  <Bar dataKey="Opened"  fill="#8DB88A" radius={[4,4,0,0]} />
                  <Bar dataKey="Shipped" fill="#E07A5F" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-5 mt-3 justify-center">
              {[['#8DB88A','Opened'],['#E07A5F','Shipped']].map(([color, label]) => (
                <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--bloom-muted)' }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Donut – status breakdown */}
          <div className="bloom-card p-6 flex flex-col">
            <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>Status breakdown</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--bloom-muted)' }}>Where time is being spent</p>
            <div className="flex-1 min-h-[180px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value" stroke="none">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--bloom-surface)', border: '1px solid var(--bloom-border)', borderRadius: 10 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold font-serif" style={{ color: 'var(--bloom-text)' }}>{data?.percent || 0}%</span>
                <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--bloom-muted)' }}>Done</span>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {pieData.map((entry, i) => (
                <div key={entry.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span style={{ color: 'var(--bloom-muted)' }}>{entry.name}</span>
                  </div>
                  <span className="font-semibold" style={{ color: 'var(--bloom-text)' }}>
                    {data?.total ? Math.round((entry.value / data.total) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
