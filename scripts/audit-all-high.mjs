#!/usr/bin/env node
//
// Fail on any high or critical advisory in the `npm audit --json` report on stdin,
// except the exceptions listed here. npm audit cannot ignore a single advisory itself.
//
// Keep an exception this narrow: one advisory, one package, a reason it cannot be fixed
// yet, and an expiry date. Anything this script cannot read counts as a failure.

import { readFileSync } from 'node:fs';

const EXCEPTIONS = [
	{
		// Zod memory exhaustion, reached only through the n8n development toolchain. This
		// package ships no runtime dependencies and audit:production stays strict. A zod 4
		// override is not possible: n8n-workflow calls z.string().ip(), which zod 4 removed,
		// so lint and the tests crash, and n8n's no-overrides-field lint rule rejects the
		// field anyway. n8n's latest, beta and rc releases all stay on zod 3.
		advisory: 'GHSA-mrhx-c7xc-m3w5',
		package: 'zod',
		expires: '2027-02-01',
	},
];

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function fail(message) {
	console.error(message);
	process.exit(1);
}

function readReport() {
	try {
		return JSON.parse(readFileSync(0, 'utf8'));
	} catch (error) {
		return fail(`Could not read the npm audit report: ${error.message}`);
	}
}

const report = readReport();
const { critical, high } = report.metadata?.vulnerabilities ?? {};
if (!report.vulnerabilities || critical === undefined || high === undefined) {
	fail(`npm audit did not return a report: ${JSON.stringify(report).slice(0, 500)}`);
}

// A chained package lists the package it inherits from as a string in `via`, so the
// advisory objects are the root causes of every high or critical entry.
const advisories = Object.values(report.vulnerabilities)
	.flatMap((vulnerability) => vulnerability.via)
	.filter((via) => typeof via === 'object' && BLOCKING_SEVERITIES.has(via.severity));

if (critical + high > 0 && advisories.length === 0) {
	fail(`npm audit reported ${critical} critical and ${high} high, but no advisory was readable.`);
}

const today = new Date().toISOString().slice(0, 10);
const exceptionFor = (advisory) =>
	EXCEPTIONS.find(
		(exception) =>
			advisory.url.endsWith(`/${exception.advisory}`) &&
			advisory.name === exception.package &&
			today <= exception.expires,
	);

const blocking = advisories.filter((advisory) => !exceptionFor(advisory));

for (const advisory of advisories) {
	const exception = exceptionFor(advisory);
	if (exception) {
		console.log(`Allowed until ${exception.expires}: ${advisory.name} ${advisory.url}`);
	}
}

if (blocking.length > 0) {
	for (const advisory of blocking) {
		console.error(`${advisory.severity}: ${advisory.name} ${advisory.title} ${advisory.url}`);
	}
	fail(`${blocking.length} high or critical advisories are not covered by an exception.`);
}

console.log('No high or critical advisories beyond the listed exceptions.');
