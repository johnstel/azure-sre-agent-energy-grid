export interface PreflightCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface Pod {
  name: string;
  namespace: string;
  status: string;
  ready: boolean;
  restarts: number;
  age: string;
}

export interface Service {
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  ports: string;
}

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  source: string;
  timestamp: string;
}

export interface Scenario {
  name: string;
  file: string;
  description: string;
  enabled: boolean;
}

export interface DeployParams {
  location: string;
  skipConfirmation?: boolean;
}

export interface DestroyParams {
  resourceGroupName: string;
  skipConfirmation?: boolean;
}

export interface Job {
  requestId: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  exitCode?: number;
}

export interface ToolStatus {
  name: string;
  available: boolean;
  version?: string;
  path?: string;
}
