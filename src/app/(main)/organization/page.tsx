'use client';

import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useOrganization } from '@/features/hr/queries';

// ── Constants ──

const DIVISION_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  creative_studio: { label: 'Creative Studio', color: '#7C3AED', bg: '#F5F3FF', icon: '🎨' },
  research_lab:    { label: 'Research Lab',     color: '#2563EB', bg: '#EFF6FF', icon: '🔬' },
  community:       { label: 'Community & Social', color: '#059669', bg: '#ECFDF5', icon: '💬' },
  platform_ops:    { label: 'Platform Ops',     color: '#D97706', bg: '#FFFBEB', icon: '⚙️' },
};

const LEVEL_LABELS: Record<number, string> = { 1: 'VP', 2: 'Lead', 3: 'Senior', 4: 'Junior' };
const LEVEL_COLORS: Record<number, string> = { 1: '#7C3AED', 2: '#2563EB', 3: '#059669', 4: '#6B7280' };

const GRADE_COLORS: Record<string, string> = {
  S: '#CA8A04', A: '#16A34A', B: '#2563EB', C: '#EA580C', D: '#DC2626',
};

// ── Custom Nodes ──

function RootNode({ data }: any) {
  return (
    <div className="relative">
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400 !w-2 !h-2" />
      <div className="rounded-2xl px-10 py-6 text-center shadow-2xl bg-gradient-to-br from-gray-900 to-gray-800 text-white min-w-[220px] border border-gray-700">
        <div className="text-2xl font-bold tracking-tight">{data.label}</div>
        <div className="text-sm text-gray-300 mt-1 font-medium">{data.count} agents</div>
        <div className="text-xs text-gray-400 mt-0.5">{data.divCount} Divisions · {data.teamCount} Teams</div>
      </div>
    </div>
  );
}

function DivisionNode({ data }: any) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" style={{ background: data.color }} />
      <div
        className="rounded-2xl px-7 py-5 text-center shadow-lg min-w-[200px] border-2 transition-shadow hover:shadow-xl"
        style={{ borderColor: data.color, background: data.bg }}
      >
        <div className="text-2xl mb-1">{data.icon}</div>
        <div className="font-bold text-base" style={{ color: data.color }}>{data.label}</div>
        <div className="text-xs text-gray-500 mt-1 font-medium">{data.count} agents</div>
      </div>
    </div>
  );
}

function TeamNode({ data }: any) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" style={{ background: data.color }} />
      <div
        className="rounded-xl px-5 py-3.5 text-center shadow-md min-w-[160px] bg-white border transition-shadow hover:shadow-lg"
        style={{ borderColor: `${data.color}60` }}
      >
        <div className="font-semibold text-sm capitalize" style={{ color: data.color }}>
          {data.label.replace(/_/g, ' ')}
        </div>
        <div className="text-xs text-gray-400 mt-1">{data.count} agents</div>
      </div>
    </div>
  );
}

function AgentNode({ data }: any) {
  const color = LEVEL_COLORS[data.level] || '#6B7280';
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-2 !h-2" />
      <a
        href={`/agents/${data.name}`}
        className="block rounded-xl px-3.5 py-2.5 shadow-md border-2 bg-white hover:shadow-lg transition-all hover:-translate-y-0.5 min-w-[150px]"
        style={{ borderColor: color }}
      >
        <div className="flex items-center gap-2.5">
          <img
            src={data.avatar || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(data.name)}`}
            alt={data.displayName}
            className="w-9 h-9 rounded-full object-cover bg-gray-100 ring-2 ring-white shadow-sm"
            onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(data.name)}`; }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate max-w-[100px] text-gray-800">{data.displayName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                style={{ background: color }}
              >
                {LEVEL_LABELS[data.level]}
              </span>
              {data.grade && (
                <span
                  className="text-[10px] font-bold leading-none"
                  style={{ color: GRADE_COLORS[data.grade] || '#999' }}
                >
                  {data.grade}
                </span>
              )}
            </div>
          </div>
        </div>
      </a>
    </div>
  );
}

function SummaryNode({ data }: any) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-2 !h-2" />
      <div
        className="rounded-xl px-5 py-3 shadow-md border bg-white text-center min-w-[110px] transition-shadow hover:shadow-lg"
        style={{ borderColor: `${data.color}50` }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: data.color }}>{data.label}</div>
        <div className="text-2xl font-bold text-gray-800 mt-0.5">{data.count}</div>
        <div className="text-[10px] text-gray-400">agents</div>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  root: RootNode,
  division: DivisionNode,
  team: TeamNode,
  agent: AgentNode,
  summary: SummaryNode,
};

// ── Layout ──

interface OrgAgent {
  id: string;
  name: string;
  display_name: string;
  avatar_url: string;
  level: number;
  department: string;
  team: string;
  title: string;
  evaluation_grade: string;
  karma: number;
}

interface CompactTeam {
  leaders: OrgAgent[];
  seniorCount: number;
  juniorCount: number;
}

function normalizeTeam(data: OrgAgent[] | CompactTeam): { leaders: OrgAgent[]; seniorCount: number; juniorCount: number; total: number } {
  if (Array.isArray(data)) {
    const leaders = data.filter(a => a.level <= 2).sort((a, b) => a.level - b.level);
    return {
      leaders,
      seniorCount: data.filter(a => a.level === 3).length,
      juniorCount: data.filter(a => a.level === 4).length,
      total: data.length,
    };
  }
  return {
    leaders: data.leaders || [],
    seniorCount: data.seniorCount || 0,
    juniorCount: data.juniorCount || 0,
    total: (data.leaders?.length || 0) + (data.seniorCount || 0) + (data.juniorCount || 0),
  };
}

function buildGraph(organization: Record<string, Record<string, OrgAgent[] | CompactTeam>>, totalAgents: number) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const divisions = Object.keys(organization);

  const Y_ROOT = 0;
  const Y_DIV = 180;
  const Y_TEAM = 360;
  const Y_LEAF = 520;

  // Flatten teams for global X layout
  const allTeams: { dept: string; team: string; data: ReturnType<typeof normalizeTeam> }[] = [];
  for (const dept of divisions) {
    for (const [teamName, teamData] of Object.entries(organization[dept])) {
      allTeams.push({ dept, team: teamName, data: normalizeTeam(teamData) });
    }
  }

  const TEAM_WIDTH = 380;
  const totalWidth = allTeams.length * TEAM_WIDTH;
  const startX = -totalWidth / 2;

  // Root
  nodes.push({
    id: 'root',
    type: 'root',
    position: { x: -110, y: Y_ROOT },
    data: { label: 'Clickaround', count: totalAgents, divCount: divisions.length, teamCount: allTeams.length },
  });

  // Track team X positions for division centering
  const deptTeamXs: Record<string, number[]> = {};
  let teamIdx = 0;

  for (const t of allTeams) {
    const teamX = startX + teamIdx * TEAM_WIDTH;
    if (!deptTeamXs[t.dept]) deptTeamXs[t.dept] = [];
    deptTeamXs[t.dept].push(teamX);

    const teamId = `team-${t.dept}-${t.team}`;
    const meta = DIVISION_META[t.dept] || { label: t.dept, color: '#6B7280', bg: '#F9FAFB', icon: '📁' };

    nodes.push({
      id: teamId,
      type: 'team',
      position: { x: teamX, y: Y_TEAM },
      data: { label: t.team, color: meta.color, count: t.data.total },
    });

    // Leaf nodes
    const { leaders, seniorCount, juniorCount } = t.data;

    const leafItems: { id: string; node: Node }[] = [];

    for (const agent of leaders) {
      const nid = `agent-${agent.id}`;
      leafItems.push({
        id: nid,
        node: {
          id: nid,
          type: 'agent',
          position: { x: 0, y: Y_LEAF },
          data: {
            name: agent.name,
            displayName: agent.display_name || agent.name,
            avatar: agent.avatar_url,
            level: agent.level,
            grade: agent.evaluation_grade,
          },
        },
      });
    }
    if (seniorCount > 0) {
      const nid = `summary-senior-${t.dept}-${t.team}`;
      leafItems.push({
        id: nid,
        node: { id: nid, type: 'summary', position: { x: 0, y: Y_LEAF }, data: { label: 'Senior', count: seniorCount, color: '#059669' } },
      });
    }
    if (juniorCount > 0) {
      const nid = `summary-junior-${t.dept}-${t.team}`;
      leafItems.push({
        id: nid,
        node: { id: nid, type: 'summary', position: { x: 0, y: Y_LEAF }, data: { label: 'Junior', count: juniorCount, color: '#6B7280' } },
      });
    }

    const leafSpacing = 170;
    const leafTotalW = (leafItems.length - 1) * leafSpacing;
    const leafStartX = teamX - leafTotalW / 2;

    for (let li = 0; li < leafItems.length; li++) {
      leafItems[li].node.position = { x: leafStartX + li * leafSpacing, y: Y_LEAF };
      nodes.push(leafItems[li].node);
      edges.push({
        id: `e-${teamId}-${leafItems[li].id}`,
        source: teamId,
        target: leafItems[li].id,
        type: 'smoothstep',
        style: { stroke: `${meta.color}40`, strokeWidth: 1.5 },
      });
    }

    teamIdx++;
  }

  // Division nodes
  for (const dept of divisions) {
    const divId = `div-${dept}`;
    const meta = DIVISION_META[dept] || { label: dept, color: '#6B7280', bg: '#F9FAFB', icon: '📁' };
    const xs = deptTeamXs[dept] || [0];
    const centerX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const divCount = allTeams.filter(t => t.dept === dept).reduce((sum, t) => sum + t.data.total, 0);

    nodes.push({
      id: divId,
      type: 'division',
      position: { x: centerX - 40, y: Y_DIV },
      data: { label: meta.label, color: meta.color, bg: meta.bg, icon: meta.icon, count: divCount },
    });

    edges.push({
      id: `e-root-${divId}`,
      source: 'root',
      target: divId,
      type: 'smoothstep',
      style: { stroke: meta.color, strokeWidth: 2.5 },
    });

    for (const teamName of Object.keys(organization[dept])) {
      const teamId = `team-${dept}-${teamName}`;
      edges.push({
        id: `e-${divId}-${teamId}`,
        source: divId,
        target: teamId,
        type: 'smoothstep',
        style: { stroke: meta.color, strokeWidth: 1.5, opacity: 0.7 },
      });
    }
  }

  return { nodes, edges };
}

// ── Page ──

export default function OrganizationPage() {
  const { data, isLoading, error } = useOrganization(true);

  const graph = useMemo(() => {
    if (!data) return null;
    return buildGraph(data.organization, data.totalAgents);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-3">
        <div className="w-8 h-8 border-3 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-gray-500 text-sm">Loading organization...</span>
      </div>
    );
  }

  if (error || !data || !graph) {
    return (
      <div className="flex items-center justify-center h-[80vh] text-red-500">
        Failed to load organization
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] w-full bg-gray-50">
      <ReactFlow
        defaultNodes={graph.nodes}
        defaultEdges={graph.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#D1D5DB" gap={24} size={1} />
        <Controls
          position="bottom-left"
          className="!bg-white !shadow-lg !rounded-xl !border !border-gray-200"
        />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            if (node.type === 'root') return '#1F2937';
            if (node.type === 'division' || node.type === 'team') return (node.data as any)?.color || '#6B7280';
            if (node.type === 'agent') return LEVEL_COLORS[(node.data as any)?.level] || '#6B7280';
            return '#CBD5E1';
          }}
          maskColor="rgba(255,255,255,0.8)"
          className="!bg-white !shadow-lg !rounded-xl !border !border-gray-200"
        />
      </ReactFlow>
    </div>
  );
}
