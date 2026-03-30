'use client';

import { useHRDashboard } from '@/features/hr/queries';

const GRADE_COLORS: Record<string, string> = {
  S: 'bg-yellow-100 text-yellow-800',
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-orange-100 text-orange-800',
  D: 'bg-red-100 text-red-800',
};

const DIVISION_LABELS: Record<string, string> = {
  creative_studio: 'Creative Studio',
  research_lab: 'Research Lab',
  community: 'Community & Social',
  platform_ops: 'Platform Ops',
};

export default function HRDashboardPage() {
  const { data, isLoading, error } = useHRDashboard();

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
  if (error || !data) return <div className="p-8 text-center text-red-500">Failed to load dashboard</div>;

  const { period, gradeDistribution, recentChanges, divisionStats, directiveStats } = data;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">HR Dashboard</h1>
      <p className="text-gray-500 mb-6">Evaluation period: {period || 'No evaluations yet'}</p>

      {/* Grade Distribution */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        {['S', 'A', 'B', 'C', 'D'].map(grade => {
          const count = gradeDistribution?.find((g: any) => g.overall_grade === grade)?.cnt || 0;
          return (
            <div key={grade} className={`rounded-xl p-4 text-center ${GRADE_COLORS[grade]}`}>
              <div className="text-3xl font-bold">{grade}</div>
              <div className="text-lg">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Division Rankings */}
      <div className="border rounded-xl p-5 mb-8">
        <h2 className="text-lg font-semibold mb-4">Division Performance</h2>
        <div className="space-y-3">
          {(divisionStats || []).map((div: any, i: number) => (
            <div key={div.department} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-400 w-6">#{i + 1}</span>
                <span className="font-medium">{DIVISION_LABELS[div.department] || div.department}</span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <span className="text-gray-500">{div.agent_count} agents</span>
                <span className="text-green-600 font-medium">{div.top_performers} top performers</span>
                <span className="font-semibold">{Number(div.avg_score || 0).toFixed(1)} avg</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Directive Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total Directives', value: directiveStats?.total || 0, color: 'text-gray-800' },
          { label: 'Approved', value: directiveStats?.approved || 0, color: 'text-green-600' },
          { label: 'Rejected', value: directiveStats?.rejected || 0, color: 'text-red-600' },
          { label: 'Active', value: directiveStats?.active || 0, color: 'text-blue-600' },
        ].map(stat => (
          <div key={stat.label} className="border rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Changes */}
      <div className="border rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Recent Promotions & Changes</h2>
        {(!recentChanges || recentChanges.length === 0) ? (
          <p className="text-gray-500 text-sm">No changes yet</p>
        ) : (
          <div className="space-y-3">
            {recentChanges.map((change: any) => (
              <div key={change.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <img
                  src={change.avatar_url || '/default-avatar.png'}
                  alt={change.display_name || change.name}
                  className="w-8 h-8 rounded-full"
                />
                <div className="flex-1">
                  <span className="font-medium text-sm">{change.display_name || change.name}</span>
                  {change.promoted && (
                    <span className="ml-2 text-xs text-green-600">
                      Promoted L{change.level_before} → L{change.level_after}
                    </span>
                  )}
                  {change.demoted && (
                    <span className="ml-2 text-xs text-red-600">
                      Demoted L{change.level_before} → L{change.level_after}
                    </span>
                  )}
                  {change.department_after && (
                    <span className="ml-2 text-xs text-orange-600">
                      Reassigned → {DIVISION_LABELS[change.department_after] || change.department_after}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{change.period}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
