import { describe, expect, test } from 'bun:test';
import { RWLock } from '@/utils/rwlock';

describe('RWLock', () => {
	test('allows multiple concurrent readers', async () => {
		const lock = new RWLock();

		const release1 = await lock.acquireRead();
		const release2 = await lock.acquireRead();
		const release3 = await lock.acquireRead();

		expect(lock.state.readers).toBe(3);
		expect(lock.state.writer).toBe(false);

		release1();
		release2();
		release3();

		expect(lock.state.readers).toBe(0);
	});

	test('writer blocks readers', async () => {
		const lock = new RWLock();
		const order: string[] = [];

		const writeRelease = await lock.acquireWrite();
		order.push('write-acquired');

		const readPromise = lock.acquireRead().then((release) => {
			order.push('read-acquired');
			release();
		});

		await Bun.sleep(10);
		expect(lock.state.pendingReads).toBe(1);

		writeRelease();
		order.push('write-released');

		await readPromise;

		expect(order).toEqual(['write-acquired', 'write-released', 'read-acquired']);
	});

	test('readers block writer', async () => {
		const lock = new RWLock();
		const order: string[] = [];

		const readRelease = await lock.acquireRead();
		order.push('read-acquired');

		const writePromise = lock.acquireWrite().then((release) => {
			order.push('write-acquired');
			release();
		});

		await Bun.sleep(10);
		expect(lock.state.pendingWrites).toBe(1);

		readRelease();
		order.push('read-released');

		await writePromise;

		expect(order).toEqual(['read-acquired', 'read-released', 'write-acquired']);
	});

	test('writer has priority over new readers', async () => {
		const lock = new RWLock();
		const order: string[] = [];

		const readRelease1 = await lock.acquireRead();
		order.push('read1-acquired');

		const writePromise = lock.acquireWrite().then((release) => {
			order.push('write-acquired');
			return release;
		});

		await Bun.sleep(5);

		const readPromise2 = lock.acquireRead().then((release) => {
			order.push('read2-acquired');
			release();
		});

		await Bun.sleep(5);

		readRelease1();
		order.push('read1-released');

		const writeRelease = await writePromise;
		writeRelease();
		order.push('write-released');

		await readPromise2;

		expect(order).toEqual([
			'read1-acquired',
			'read1-released',
			'write-acquired',
			'write-released',
			'read2-acquired',
		]);
	});

	test('only one writer at a time', async () => {
		const lock = new RWLock();
		const order: string[] = [];

		const release1 = await lock.acquireWrite();
		order.push('write1-acquired');

		const writePromise2 = lock.acquireWrite().then((release) => {
			order.push('write2-acquired');
			release();
		});

		await Bun.sleep(10);
		expect(lock.state.pendingWrites).toBe(1);

		release1();
		order.push('write1-released');

		await writePromise2;

		expect(order).toEqual(['write1-acquired', 'write1-released', 'write2-acquired']);
	});

	test('state reflects current lock status', async () => {
		const lock = new RWLock();

		expect(lock.state).toEqual({
			readers: 0,
			writer: false,
			pendingReads: 0,
			pendingWrites: 0,
		});

		const readRelease = await lock.acquireRead();
		expect(lock.state.readers).toBe(1);

		readRelease();
		expect(lock.state.readers).toBe(0);

		const writeRelease = await lock.acquireWrite();
		expect(lock.state.writer).toBe(true);

		writeRelease();
		expect(lock.state.writer).toBe(false);
	});
});
