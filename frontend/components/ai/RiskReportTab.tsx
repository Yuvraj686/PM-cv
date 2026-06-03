'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface RiskAnalysis {
  risk_level: 'low' | 'medium' | 'high';
  top_risks: string[];
  recommendations: string[];
}

const RISK_STYLES = {
  low: { bg: '#8DB88A33', color: '#4a8a46', label: 'Low Risk' },
  medium: { bg: '#C9A84C33', color: '#9a7a1a', label: 'Medium Risk' },
  high: { bg: '#E07A5F33', color: '#c0392b', label: 'High Risk' },
};

interface RiskReportTabProps {
  projectId: string;
}

export function RiskReportTab({ projectId }: RiskReportTabProps) {
  const [data, setData] = useState<RiskAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRisk = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const url = `/api/ai/analyze-risk/${projectId}${refresh ? '?refresh=true' : ''}`;
      const result = await apiClient.post(url);
      setData(result);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to analyze risk');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRisk(false);
  }, [fetchRisk]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--bloom-coral)' }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-sm" style={{ color: 'var(--bloom-muted)' }}>
        Unable to load risk analysis.
      </div>
    );
  }

  const style = RISK_STYLES[data.risk_level] || RISK_STYLES.low;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle size={20} style={{ color: style.color }} />
          <span
            className="text-sm font-semibold px-3 py-1 rounded-full"
            style={{ background: style.bg, color: style.color }}
          >
            {style.label}
          </span>
        </div>
        <button
          onClick={() => fetchRisk(true)}
          disabled={refreshing}
          className="bloom-btn-secondary flex items-center gap-1.5 text-sm"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bloom-card p-5">
          <h4 className="font-serif font-bold mb-3" style={{ color: 'var(--bloom-text)' }}>Top Risks</h4>
          {data.top_risks.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>No significant risks detected.</p>
          ) : (
            <ul className="space-y-2">
              {data.top_risks.map((risk, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: style.color }}>
                    {i + 1}
                  </span>
                  <span style={{ color: 'var(--bloom-text)' }}>{risk}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bloom-card p-5">
          <h4 className="font-serif font-bold mb-3" style={{ color: 'var(--bloom-text)' }}>Recommendations</h4>
          {data.recommendations.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--bloom-muted)' }}>No recommendations at this time.</p>
          ) : (
            <ul className="space-y-2">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 mt-0.5" style={{ color: 'var(--bloom-green-bg)' }}>✓</span>
                  <span style={{ color: 'var(--bloom-text)' }}>{rec}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
