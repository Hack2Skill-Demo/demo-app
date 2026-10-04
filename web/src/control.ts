/** Types of what the demo controller's `control-*` callables return (demo-control, src/controller/read.ts and health.ts). */
export interface ScenarioView {
  id: string;
  title: string;
  group: string;
  status: string;
  expected: string;
  pressable: boolean;
  teamPressable: boolean;
  notPressableReason?: string;
  lastResult: { outcome: string; failed: boolean; at: string | null } | null;
}

export interface CycleView {
  cycleId: string;
  scenarioId: string;
  scenarioTitle: string | null;
  state: string;
  startedAt: string;
  deadline: string;
  endedAt: string | null;
  remainingSeconds: number | null;
  failure: string | null;
  failed: boolean;
}

export interface FeatureHealth {
  feature: string;
  label: string;
  status: 'unknown' | 'healthy' | 'degraded' | 'failing';
  successRate: number | null;
  ok: number;
  failed: number;
}

export interface HealthStrip {
  windowMinutes: number;
  features: FeatureHealth[];
}
