#!/usr/bin/env bash
#
# Verify that the published tarball installs and loads on a consumer's Node runtime.
#
# Why this exists instead of a plain `npm ci` on the lowest supported Node:
# the development toolchain cannot be installed on Node 20. @n8n/node-cli pulls in
# isolated-vm transitively, and isolated-vm's node-gyp build needs Node >= 22.
# Consumers never install that toolchain. This package ships no runtime
# dependencies and only peer-depends on n8n-workflow, so the floor declared in
# package.json "engines" is exercised here against the exact tarball npm
# publishes, in a clean project, on whichever Node is currently active.
#
# Usage: scripts/verify-consumer-install.sh <path-to-tarball>
#
# Environment:
#   N8N_WORKFLOW_RANGE  npm range for the n8n-workflow peer (default: 1)

set -euo pipefail

TARBALL_ARG="${1:-}"
if [ -z "$TARBALL_ARG" ]; then
	echo "usage: scripts/verify-consumer-install.sh <path-to-tarball>" >&2
	exit 2
fi

if [ ! -f "$TARBALL_ARG" ]; then
	echo "tarball not found: $TARBALL_ARG" >&2
	exit 2
fi

TARBALL="$(cd "$(dirname "$TARBALL_ARG")" && pwd)/$(basename "$TARBALL_ARG")"
N8N_WORKFLOW_RANGE="${N8N_WORKFLOW_RANGE:-1}"

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "Consumer Node:  $(node -v)"
echo "Tarball:        $TARBALL"
echo "n8n-workflow:   $N8N_WORKFLOW_RANGE"

cat > "$WORKDIR/smoke.cjs" <<'SMOKE'
// Load the installed package exactly the way n8n loads a community node:
// read the "n8n" block from its package.json and require every declared entry.
const path = require('node:path');

const manifestPath = require.resolve('n8n-nodes-pisama/package.json');
const manifest = require(manifestPath);
const packageRoot = path.dirname(manifestPath);

const failures = [];

function check(label, condition, detail) {
	if (condition) {
		console.log(`ok    ${label}`);
	} else {
		console.log(`FAIL  ${label}${detail ? ` (${detail})` : ''}`);
		failures.push(label);
	}
}

check('package.json declares an n8n block', Boolean(manifest.n8n));

const declaredNodes = (manifest.n8n && manifest.n8n.nodes) || [];
const declaredCredentials = (manifest.n8n && manifest.n8n.credentials) || [];

check('declares at least one node', declaredNodes.length > 0);
check('declares at least one credential', declaredCredentials.length > 0);

const loaded = { nodes: [], credentials: [] };

for (const relative of [...declaredNodes, ...declaredCredentials]) {
	const target = path.join(packageRoot, relative);
	const isNode = declaredNodes.includes(relative);
	let exported;
	try {
		exported = require(target);
	} catch (error) {
		check(`require ${relative}`, false, error.message);
		continue;
	}
	check(`require ${relative}`, true);

	// n8n instantiates the exported class and reads its descriptor.
	const classes = Object.values(exported).filter((value) => typeof value === 'function');
	check(`${relative} exports a class`, classes.length > 0);

	for (const Ctor of classes) {
		let instance;
		try {
			instance = new Ctor();
		} catch (error) {
			check(`instantiate ${Ctor.name}`, false, error.message);
			continue;
		}
		if (isNode) {
			check(
				`${Ctor.name}.description.name is set`,
				Boolean(instance.description && instance.description.name),
			);
			if (instance.description && instance.description.name) {
				loaded.nodes.push(instance.description.name);
			}
		} else {
			check(`${Ctor.name}.name is set`, Boolean(instance.name));
			if (instance.name) {
				loaded.credentials.push(instance.name);
			}
		}
	}
}

// The node declares a credential; that credential must be one the package ships.
check('node "pisama" loaded', loaded.nodes.includes('pisama'), loaded.nodes.join(', '));
check(
	'credential "pisamaApi" loaded',
	loaded.credentials.includes('pisamaApi'),
	loaded.credentials.join(', '),
);

// The engines floor the package advertises must accept the Node running this check.
// This is what couples the CI matrix to package.json: raising the floor above a
// Node version that still has a job here turns this red instead of silently
// dropping users who are on the older runtime.
const engines = (manifest.engines && manifest.engines.node) || '';
check('package.json declares engines.node', engines !== '');

const floorMatch = /^>=\s*(\d+)/.exec(engines);
check(`engines.node "${engines}" declares a ">=major" floor`, floorMatch !== null);

if (floorMatch) {
	const floor = Number(floorMatch[1]);
	const running = Number(process.versions.node.split('.')[0]);
	check(
		`running Node ${running} satisfies the declared floor >=${floor}`,
		running >= floor,
		`this Node version is tested in CI but excluded by package.json engines`,
	);
}

console.log(`\nengines.node = ${engines}, running ${process.version}`);

if (failures.length > 0) {
	console.error(`\n${failures.length} consumer check(s) failed.`);
	process.exit(1);
}

console.log('\nConsumer install verified.');
SMOKE

cd "$WORKDIR"
npm init -y > /dev/null
npm install --no-audit --no-fund --loglevel=error "$TARBALL" "n8n-workflow@${N8N_WORKFLOW_RANGE}"

echo
echo "Installed n8n-workflow: $(node -p "require('n8n-workflow/package.json').version")"
echo

node smoke.cjs
