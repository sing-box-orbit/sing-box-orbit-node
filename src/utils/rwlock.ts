type ReleaseFunction = () => void;

const DEFAULT_TIMEOUT = 30000; // 30 seconds

export class RWLock {
	private readers = 0;
	private writer = false;
	private readQueue: Array<() => void> = [];
	private writeQueue: Array<() => void> = [];

	async acquireRead(timeout = DEFAULT_TIMEOUT): Promise<ReleaseFunction> {
		return new Promise((resolve, reject) => {
			let resolved = false;
			let timeoutId: ReturnType<typeof setTimeout> | null = null;

			const tryAcquire = () => {
				if (resolved) return;

				if (!this.writer && this.writeQueue.length === 0) {
					resolved = true;
					if (timeoutId) clearTimeout(timeoutId);
					this.readers++;
					resolve(this.releaseRead.bind(this));
				} else {
					this.readQueue.push(tryAcquire);
				}
			};

			timeoutId = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					// Remove from queue
					const idx = this.readQueue.indexOf(tryAcquire);
					if (idx >= 0) this.readQueue.splice(idx, 1);
					reject(new Error(`Read lock timeout after ${timeout}ms`));
				}
			}, timeout);

			tryAcquire();
		});
	}

	async acquireWrite(timeout = DEFAULT_TIMEOUT): Promise<ReleaseFunction> {
		return new Promise((resolve, reject) => {
			let resolved = false;
			let timeoutId: ReturnType<typeof setTimeout> | null = null;

			const tryAcquire = () => {
				if (resolved) return;

				if (!this.writer && this.readers === 0) {
					resolved = true;
					if (timeoutId) clearTimeout(timeoutId);
					this.writer = true;
					resolve(this.releaseWrite.bind(this));
				} else {
					this.writeQueue.push(tryAcquire);
				}
			};

			timeoutId = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					// Remove from queue
					const idx = this.writeQueue.indexOf(tryAcquire);
					if (idx >= 0) this.writeQueue.splice(idx, 1);
					reject(new Error(`Write lock timeout after ${timeout}ms`));
				}
			}, timeout);

			tryAcquire();
		});
	}

	private releaseRead(): void {
		this.readers--;
		this.processQueue();
	}

	private releaseWrite(): void {
		this.writer = false;
		this.processQueue();
	}

	private processQueue(): void {
		if (this.writeQueue.length > 0 && this.readers === 0 && !this.writer) {
			const next = this.writeQueue.shift();
			next?.();
		} else if (!this.writer) {
			while (this.readQueue.length > 0 && this.writeQueue.length === 0) {
				const next = this.readQueue.shift();
				next?.();
			}
		}
	}

	get state(): {
		readers: number;
		writer: boolean;
		pendingReads: number;
		pendingWrites: number;
	} {
		return {
			readers: this.readers,
			writer: this.writer,
			pendingReads: this.readQueue.length,
			pendingWrites: this.writeQueue.length,
		};
	}

	// Force reset lock state (use with caution, for recovery only)
	forceReset(): void {
		this.readers = 0;
		this.writer = false;
		this.readQueue = [];
		this.writeQueue = [];
	}
}
