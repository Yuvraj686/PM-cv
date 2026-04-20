'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Target, TrendingUp, Users, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444']; // Indigo, Emerald, Amber, Red

export default function AnalyticsPage() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get(`/api/projects/${id}/progress`);
        setData(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [id]);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>;

  const pieData = [
    { name: 'To Do', value: data?.todo || 0 },
    { name: 'In Progress', value: data?.in_progress || 0 },
    { name: 'Done', value: data?.done || 0 },
  ];

  // Dummy burndown data since we don't have historical snapshots in the schema yet
  const burndownData = [
    { day: 'Mon', remaining: 40 },
    { day: 'Tue', remaining: 35 },
    { day: 'Wed', remaining: 32 },
    { day: 'Thu', remaining: 25 },
    { day: 'Fri', remaining: 18 },
    { day: 'Sat', remaining: 12 },
    { day: 'Sun', remaining: Number(data?.total || 0) - Number(data?.done || 0) },
  ];

  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-geist tracking-tight">Project Analytics</h1>
          <p className="text-muted-foreground mt-1">Real-time health metrics and burndown tracking.</p>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 mb-1">Completion Rate</p>
              <h3 className="text-3xl font-bold text-white">{data?.percent || 0}%</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Target className="text-indigo-400 w-6 h-6" />
            </div>
          </div>
          
          <div className="glass-panel p-6 rounded-2xl border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 mb-1">Total Tasks</p>
              <h3 className="text-3xl font-bold text-white">{data?.total || 0}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <TrendingUp className="text-emerald-400 w-6 h-6" />
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-white/10 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 mb-1">Open Issues</p>
              <h3 className="text-3xl font-bold text-white">{(data?.total || 0) - (data?.done || 0)}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
              <Users className="text-amber-400 w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Burndown Chart */}
          <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-6 font-geist">Task Burndown (7 Days)</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={burndownData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="day" stroke="#ffffff50" axisLine={false} tickLine={false} dy={10} />
                  <YAxis stroke="#ffffff50" axisLine={false} tickLine={false} dx={-10} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0F1117', borderColor: '#ffffff20', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="remaining" 
                    stroke="#6366F1" 
                    strokeWidth={3}
                    dot={{ fill: '#0F1117', stroke: '#6366F1', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#6366F1' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status Donut Chart */}
          <div className="glass-panel p-6 rounded-2xl border border-white/10 flex flex-col">
            <h3 className="text-lg font-bold mb-2 font-geist">Status Breakdown</h3>
            <div className="flex-1 min-h-[200px] relative mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0F1117', borderColor: '#ffffff20', borderRadius: '8px' }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-white">{data?.percent || 0}%</span>
                <span className="text-xs text-gray-500 uppercase tracking-widest mt-1">Done</span>
              </div>
            </div>
            
            <div className="mt-6 space-y-2">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex justify-between items-center text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                    <span className="text-gray-300">{entry.name}</span>
                  </div>
                  <span className="font-medium text-white">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
