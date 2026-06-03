'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RiskReportTab } from '@/components/ai/RiskReportTab';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

type ProgressData = {
  total: number;
  done: number;
  in_progress: number;
  todo: number;
  percent: number;
};

type BurndownPoint = {
  date: string;
  remaining_points: number;
  ideal_remaining: number;
};

type VelocityPoint = {
  sprint_label: string;
  points_completed: number;
};

type CycleTimePoint = {
  status: string;
  avg_days: number;
};

type WorkloadPoint = {
  user: {
    id: string;
    name: string;
    avatar: string | null;
  };
  open_tasks: number;
  total_points: number;
};

const PIE_COLORS = ['#8DB88A', '#E07A5F', '#C9A84C', '#9B8EC4'];

function formatDateLabel(isoDate: string) {
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toCsv(rows: Record<string, string | number | null>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number | null) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h] as string | number | null)).join(',')),
  ];
  return lines.join('\n');
}

export default function AnalyticsPage() {
  const { id } = useParams();
  const router = useRouter();
  const projectId = id as string;
  const analyticsRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('Project');
  const [progress, setProgress] = useState<ProgressData>({ total: 0, done: 0, in_progress: 0, todo: 0, percent: 0 });
  const [burndown, setBurndown] = useState<BurndownPoint[]>([]);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);
  const [cycleTime, setCycleTime] = useState<CycleTimePoint[]>([]);
  const [workload, setWorkload] = useState<WorkloadPoint[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [progressRes, projectRes, burndownRes, velocityRes, cycleRes, workloadRes] = await Promise.all([
          api.get(`/api/projects/${projectId}/progress`),
          api.get(`/api/projects/${projectId}`),
          api.get(`/api/projects/${projectId}/analytics/burndown`),
          api.get(`/api/projects/${projectId}/analytics/velocity`),
          api.get(`/api/projects/${projectId}/analytics/cycle-time`),
          api.get(`/api/projects/${projectId}/analytics/workload`),
        ]);

        setProgress(progressRes.data || { total: 0, done: 0, in_progress: 0, todo: 0, percent: 0 });
        setProjectName(projectRes.data?.name || 'Project');
        setBurndown(Array.isArray(burndownRes.data) ? burndownRes.data : []);
        setVelocity(Array.isArray(velocityRes.data) ? velocityRes.data : []);
        setCycleTime(Array.isArray(cycleRes.data) ? cycleRes.data : []);
        setWorkload(Array.isArray(workloadRes.data) ? workloadRes.data : []);
      } catch {
        toast.error('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [projectId]);

  const velocityAverage = useMemo(() => {
    if (!velocity.length) return 0;
    const total = velocity.reduce((sum, row) => sum + (row.points_completed || 0), 0);
    return Math.round((total / velocity.length) * 100) / 100;
  }, [velocity]);

  const avgCycleTime = useMemo(() => {
    if (!cycleTime.length) return 0;
    const total = cycleTime.reduce((sum, row) => sum + (row.avg_days || 0), 0);
    return Math.round((total / cycleTime.length) * 10) / 10;
  }, [cycleTime]);

  const maxOpenTasks = useMemo(() => {
    return workload.length ? Math.max(...workload.map((w) => w.open_tasks), 0) : 0;
  }, [workload]);

  const velocityColor = (points: number) => {
    if (points >= velocityAverage) return '#4a8a46';
    if (points >= velocityAverage * 0.8) return '#C9A84C';
    return '#E07A5F';
  };

  const loadColor = (openTasks: number) => {
    if (openTasks <= 5) return '#4a8a46';
    if (openTasks <= 10) return '#C9A84C';
    return '#E07A5F';
  };

  const statusBreakdown = useMemo(
    () =>
      [
        { name: 'To Do', value: progress.todo || 0 },
        { name: 'In Progress', value: progress.in_progress || 0 },
        { name: 'Done', value: progress.done || 0 },
      ].filter((row) => row.value > 0),
    [progress]
  );

  const exportRowsForTab = () => {
    if (activeTab === 'burndown') {
      return burndown.map((row) => ({
        date: row.date,
        remaining_points: row.remaining_points,
        ideal_remaining: row.ideal_remaining,
      }));
    }
    if (activeTab === 'velocity') {
      return velocity.map((row) => ({
        sprint_label: row.sprint_label,
        points_completed: row.points_completed,
      }));
    }
    if (activeTab === 'cycle-time') {
      return cycleTime.map((row) => ({
        status: row.status,
        avg_days: row.avg_days,
      }));
    }
    if (activeTab === 'workload') {
      return workload.map((row) => ({
        member_name: row.user.name,
        open_tasks: row.open_tasks,
        total_points: row.total_points,
      }));
    }
    if (activeTab === 'overview') {
      return statusBreakdown.map((row) => ({
        status: row.name,
        tasks: row.value,
      }));
    }
    return [];
  };

  const handleExportCsv = () => {
    const rows = exportRowsForTab();
    if (!rows.length) {
      toast.info('No data to export for this tab');
      return;
    }
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${activeTab}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    if (!analyticsRef.current) {
      toast.error('Analytics section is not ready');
      return;
    }
    try {
      const exportedAt = new Date().toLocaleString();
      const canvas = await html2canvas(analyticsRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'pt', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 30;
      const headerHeight = 52;
      const targetWidth = pageWidth - margin * 2;
      const targetHeight = (canvas.height * targetWidth) / canvas.width;
      const fitHeight = Math.min(targetHeight, pageHeight - margin - headerHeight);

      pdf.setFontSize(14);
      pdf.text(`${projectName} Analytics`, margin, margin);
      pdf.setFontSize(10);
      pdf.text(`Exported: ${exportedAt}`, margin, margin + 16);
      pdf.addImage(imgData, 'PNG', margin, margin + headerHeight, targetWidth, fitHeight);
      pdf.save(`${projectName.toLowerCase().replace(/\s+/g, '-')}-analytics.pdf`);
    } catch {
      toast.error('Failed to export PDF');
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  const kpis = [
    { label: 'Completion rate', value: `${progress.percent || 0}%`, sub: 'Done tasks', bg: 'var(--bloom-green-bg)' },
    { label: 'Tasks completed', value: progress.done || 0, sub: `out of ${progress.total || 0}`, bg: 'var(--bloom-coral-bg)' },
    { label: 'Average velocity', value: velocityAverage, sub: 'Points per sprint', bg: 'var(--bloom-yellow-bg)' },
    { label: 'Avg cycle time', value: `${avgCycleTime}d`, sub: 'Across columns', bg: 'var(--bloom-purple-bg)' },
  ];

  return (
    <div className="p-6 h-full overflow-y-auto w-full">
      <div className="max-w-6xl mx-auto space-y-6" ref={analyticsRef}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl font-bold" style={{ color: 'var(--bloom-text)' }}>
              Advanced Analytics
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--bloom-muted)' }}>
              Burndown, velocity, cycle time, and team workload
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="bloom-btn-secondary flex items-center gap-1.5">
              <Download size={14} />
              Export
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>Export as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="burndown">Burndown</TabsTrigger>
            <TabsTrigger value="velocity">Velocity</TabsTrigger>
            <TabsTrigger value="cycle-time">Cycle Time</TabsTrigger>
            <TabsTrigger value="workload">Team Workload</TabsTrigger>
            <TabsTrigger value="risk">Risk Report</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {kpis.map((k) => (
                <div key={k.label} className="bloom-card p-5">
                  <div className="w-8 h-8 rounded-lg mb-3" style={{ background: k.bg }} />
                  <div className="text-3xl font-bold font-serif mb-0.5" style={{ color: 'var(--bloom-text)' }}>
                    {k.value}
                  </div>
                  <div className="text-sm font-medium" style={{ color: 'var(--bloom-text)' }}>
                    {k.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--bloom-muted)' }}>
                    · {k.sub}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bloom-card p-6">
                <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>
                  Status totals
                </h3>
                <p className="text-xs mb-4" style={{ color: 'var(--bloom-muted)' }}>
                  Tasks by workflow stage
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--bloom-border)" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bloom-surface)',
                          border: '1px solid var(--bloom-border)',
                          borderRadius: 10,
                        }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#8DB88A" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bloom-card p-6">
                <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>
                  Completion split
                </h3>
                <p className="text-xs mb-4" style={{ color: 'var(--bloom-muted)' }}>
                  Distribution across board states
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusBreakdown} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={4} stroke="none">
                        {statusBreakdown.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bloom-surface)',
                          border: '1px solid var(--bloom-border)',
                          borderRadius: 10,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="burndown" className="mt-6">
            {burndown.length === 0 ? (
              <div className="bloom-card p-8 text-center space-y-3">
                <h3 className="font-serif text-lg font-bold" style={{ color: 'var(--bloom-text)' }}>
                  No Active Sprint
                </h3>
                <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>
                  Start a sprint to track progress with a burndown chart.
                </p>
                <button className="bloom-btn-primary" onClick={() => router.push(`/projects/${projectId}/tasks`)}>
                  Start a sprint
                </button>
              </div>
            ) : (
              <div className="bloom-card p-6">
                <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>
                  Sprint Burndown
                </h3>
                <p className="text-xs mb-4" style={{ color: 'var(--bloom-muted)' }}>
                  Remaining story points vs ideal trajectory
                </p>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={burndown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--bloom-border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDateLabel}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--bloom-muted)', fontSize: 12 }}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 11 }} />
                      <Tooltip
                        labelFormatter={(label) => formatDateLabel(label as string)}
                        contentStyle={{
                          background: 'var(--bloom-surface)',
                          border: '1px solid var(--bloom-border)',
                          borderRadius: 10,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="remaining_points"
                        stroke="#E07A5F"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        name="Actual remaining"
                      />
                      <Line
                        type="monotone"
                        dataKey="ideal_remaining"
                        stroke="#8a8a8a"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        name="Ideal remaining"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="velocity" className="mt-6">
            <div className="bloom-card p-6">
              <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>
                Sprint Velocity
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--bloom-muted)' }}>
                Green = met/exceeded, amber = within 20%, red = missed
              </p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={velocity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bloom-border)" vertical={false} />
                    <XAxis dataKey="sprint_label" axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bloom-surface)',
                        border: '1px solid var(--bloom-border)',
                        borderRadius: 10,
                      }}
                    />
                    <ReferenceLine
                      y={velocityAverage}
                      stroke="#6b7280"
                      strokeDasharray="4 4"
                      label={{ value: `Avg ${velocityAverage}`, fill: '#6b7280', fontSize: 11, position: 'insideTopRight' }}
                    />
                    <Bar dataKey="points_completed" radius={[6, 6, 0, 0]}>
                      {velocity.map((entry, index) => (
                        <Cell key={`${entry.sprint_label}-${index}`} fill={velocityColor(entry.points_completed)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cycle-time" className="mt-6">
            <div className="bloom-card p-6">
              <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>
                Cycle Time by Status
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--bloom-muted)' }}>
                Average days tasks spend in each Kanban column
              </p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cycleTime} layout="vertical" margin={{ left: 16, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bloom-border)" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 11 }} />
                    <YAxis dataKey="status" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--bloom-muted)', fontSize: 12 }} width={110} />
                    <Tooltip
                      formatter={(value, _name, item) => [
                        `Tasks spend an average of ${Number(value).toFixed(2)} days in ${item?.payload?.status}`,
                        'Cycle time',
                      ]}
                      contentStyle={{
                        background: 'var(--bloom-surface)',
                        border: '1px solid var(--bloom-border)',
                        borderRadius: 10,
                      }}
                    />
                    <Bar dataKey="avg_days" fill="#8DB88A" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="workload" className="mt-6">
            <div className="bloom-card p-6">
              <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'var(--bloom-text)' }}>
                Team Workload
              </h3>
              <p className="text-xs mb-4" style={{ color: 'var(--bloom-muted)' }}>
                Click a member to filter the Kanban board to their assigned tasks
              </p>
              <div className="space-y-3">
                {workload.map((member) => {
                  const loadPercent = maxOpenTasks > 0 ? Math.round((member.open_tasks / maxOpenTasks) * 100) : 0;
                  const barColor = loadColor(member.open_tasks);
                  return (
                    <button
                      key={member.user.id}
                      className="w-full text-left p-4 rounded-xl border transition-colors hover:bg-black/5"
                      style={{ borderColor: 'var(--bloom-border)' }}
                      onClick={() => router.push(`/projects/${projectId}/tasks?assignee=${member.user.id}`)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar size="sm">
                            <AvatarImage src={member.user.avatar || undefined} alt={member.user.name} />
                            <AvatarFallback>{member.user.name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--bloom-text)' }}>
                              {member.user.name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--bloom-muted)' }}>
                              {member.open_tasks} open tasks · {member.total_points} story points
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-semibold" style={{ color: barColor }}>
                          {loadPercent}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 w-full rounded-full" style={{ background: 'var(--bloom-border)' }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{ width: `${loadPercent}%`, background: barColor }}
                        />
                      </div>
                    </button>
                  );
                })}
                {!workload.length && (
                  <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>
                    No team workload data yet.
                  </p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="mt-6">
            <RiskReportTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
