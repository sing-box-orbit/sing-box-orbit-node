#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';

const LCOV_PATH = 'coverage/lcov.info';

interface CoverageData {
	linesFound: number;
	linesHit: number;
	functionsFound: number;
	functionsHit: number;
	branchesFound: number;
	branchesHit: number;
}

function parseLcov(content: string): CoverageData {
	const data: CoverageData = {
		linesFound: 0,
		linesHit: 0,
		functionsFound: 0,
		functionsHit: 0,
		branchesFound: 0,
		branchesHit: 0,
	};

	for (const line of content.split('\n')) {
		if (line.startsWith('LF:')) data.linesFound += Number.parseInt(line.slice(3), 10);
		if (line.startsWith('LH:')) data.linesHit += Number.parseInt(line.slice(3), 10);
		if (line.startsWith('FNF:')) data.functionsFound += Number.parseInt(line.slice(4), 10);
		if (line.startsWith('FNH:')) data.functionsHit += Number.parseInt(line.slice(4), 10);
		if (line.startsWith('BRF:')) data.branchesFound += Number.parseInt(line.slice(4), 10);
		if (line.startsWith('BRH:')) data.branchesHit += Number.parseInt(line.slice(4), 10);
	}

	return data;
}

function percent(hit: number, found: number): string {
	if (found === 0) return 'N/A';
	return `${((hit / found) * 100).toFixed(2)}%`;
}

function colorize(pct: number): string {
	if (pct >= 80) return '\x1b[32m';
	if (pct >= 60) return '\x1b[33m';
	return '\x1b[31m';
}

function main() {
	if (!existsSync(LCOV_PATH)) {
		console.log('\x1b[33mNo coverage data found. Run: bun test:coverage\x1b[0m');
		process.exit(0);
	}

	const content = readFileSync(LCOV_PATH, 'utf-8');
	const data = parseLcov(content);

	const linePct = data.linesFound > 0 ? (data.linesHit / data.linesFound) * 100 : 0;
	const funcPct = data.functionsFound > 0 ? (data.functionsHit / data.functionsFound) * 100 : 0;
	const branchPct = data.branchesFound > 0 ? (data.branchesHit / data.branchesFound) * 100 : 0;

	const reset = '\x1b[0m';
	const bold = '\x1b[1m';
	const dim = '\x1b[2m';

	console.log('');
	console.log(`${bold}══════════════════════════════════════${reset}`);
	console.log(`${bold}        COVERAGE SUMMARY${reset}`);
	console.log(`${bold}══════════════════════════════════════${reset}`);
	console.log('');
	console.log(`  ${bold}Lines:${reset}     ${colorize(linePct)}${percent(data.linesHit, data.linesFound)}${reset} ${dim}(${data.linesHit}/${data.linesFound})${reset}`);
	console.log(`  ${bold}Functions:${reset} ${colorize(funcPct)}${percent(data.functionsHit, data.functionsFound)}${reset} ${dim}(${data.functionsHit}/${data.functionsFound})${reset}`);
	if (data.branchesFound > 0) {
		console.log(`  ${bold}Branches:${reset}  ${colorize(branchPct)}${percent(data.branchesHit, data.branchesFound)}${reset} ${dim}(${data.branchesHit}/${data.branchesFound})${reset}`);
	}
	console.log('');
	console.log(`${bold}══════════════════════════════════════${reset}`);
	console.log('');
}

main();
