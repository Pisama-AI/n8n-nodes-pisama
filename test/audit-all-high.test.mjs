import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/audit-all-high.mjs', import.meta.url));
const ZOD_ADVISORY = 'GHSA-mrhx-c7xc-m3w5';

// Pins `new Date()` inside the child process, so the real script runs past its expiry date.
const PAST_EXPIRY =
	"data:text/javascript,const D=Date;globalThis.Date=class extends D{constructor(){super('2099-01-01')}}";

function runGate(input, nodeArgs = []) {
	return spawnSync(process.execPath, [...nodeArgs, SCRIPT], { input, encoding: 'utf8' });
}

function advisory(name, id, severity = 'high') {
	return {
		source: 1243066,
		name,
		dependency: name,
		title: `Advisory in ${name}`,
		url: `https://github.com/advisories/${id}`,
		severity,
		range: '<9.0.0',
	};
}

function auditReport(...entries) {
	const vulnerabilities = Object.fromEntries(
		entries.map((via) => [via.name, { name: via.name, severity: via.severity, via: [via] }]),
	);
	const count = (severity) => entries.filter((via) => via.severity === severity).length;
	return JSON.stringify({
		auditReportVersion: 2,
		vulnerabilities,
		metadata: {
			vulnerabilities: {
				info: 0,
				low: 0,
				moderate: count('moderate'),
				high: count('high'),
				critical: count('critical'),
				total: entries.length,
			},
		},
	});
}

describe('audit:all-high gate', () => {
	it('passes a clean report', () => {
		expect(runGate(auditReport()).status).toBe(0);
	});

	it('allows the listed advisory and the packages chained to it', () => {
		const report = JSON.parse(auditReport(advisory('zod', ZOD_ADVISORY)));
		report.vulnerabilities['zod-to-json-schema'] = {
			name: 'zod-to-json-schema',
			severity: 'high',
			via: ['zod'],
		};
		report.metadata.vulnerabilities.high = 2;

		const result = runGate(JSON.stringify(report));

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`zod https://github.com/advisories/${ZOD_ADVISORY}`);
	});

	it('leaves moderate advisories to npm audit, as --audit-level=high did', () => {
		expect(runGate(auditReport(advisory('vitest', 'GHSA-aaaa', 'moderate'))).status).toBe(0);
	});

	it('fails on a high or critical advisory in another package', () => {
		for (const severity of ['high', 'critical']) {
			const result = runGate(
				auditReport(advisory('zod', ZOD_ADVISORY), advisory('axios', 'GHSA-bbbb', severity)),
			);

			expect(result.status).toBe(1);
			expect(result.stderr).toContain('GHSA-bbbb');
			expect(result.stderr).not.toContain(ZOD_ADVISORY);
		}
	});

	it('fails on a different advisory in the listed package', () => {
		expect(runGate(auditReport(advisory('zod', 'GHSA-cccc'))).status).toBe(1);
	});

	it('fails when the listed advisory appears in a different package', () => {
		expect(runGate(auditReport(advisory('axios', ZOD_ADVISORY))).status).toBe(1);
	});

	it('fails once the exception expires', () => {
		const result = runGate(auditReport(advisory('zod', ZOD_ADVISORY)), [
			`--import=${PAST_EXPIRY}`,
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(ZOD_ADVISORY);
	});

	it('fails closed on anything it cannot read', () => {
		const unreadable = [
			'',
			'npm error network request failed',
			JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'registry unreachable' } }),
			JSON.stringify({ vulnerabilities: {} }),
			JSON.stringify({
				vulnerabilities: { axios: { name: 'axios', severity: 'high', via: ['chained'] } },
				metadata: { vulnerabilities: { high: 1, critical: 0 } },
			}),
		];

		for (const input of unreadable) {
			expect(runGate(input).status, input).toBe(1);
		}
	});
});
