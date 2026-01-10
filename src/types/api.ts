export interface RestartStats {
	enabled: boolean;
	count: number;
	lastRestartAt: string | null;
	nextRestartIn: number | null;
	maxRestartsReached: boolean;
}

export interface ServerStatus {
	running: boolean;
	pid: number | null;
	uptime: number | null;
	startedAt: string | null;
	version: string | null;
	restartStats: RestartStats;
}

export interface ApiResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

export interface HealthResponse {
	status: 'ok' | 'error';
	timestamp: string;
	version: string;
}

export interface ErrorResponse {
	success: false;
	error: string;
	code?: string;
}
