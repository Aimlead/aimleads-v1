const publicUrl = String(process.env.APP_PUBLIC_URL || 'https://aimlead.io').replace(/\/$/, '');
const expectedVersion = process.env.APP_VERSION || '';
const expectedCommit = process.env.APP_COMMIT_SHA || '';
const timestamp = Date.now();

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  const text = await response.text();
  return { response, text };
};

const printSection = (title, lines) => {
  console.log(`\n${title}`);
  for (const line of lines) console.log(`- ${line}`);
};

const failures = [];

const htmlResult = await fetchText(`${publicUrl}/?ts=${timestamp}`);
const healthResult = await fetchText(`${publicUrl}/api/health?ts=${timestamp}`);

const html = htmlResult.text;
let healthPayload = null;
try {
  healthPayload = JSON.parse(healthResult.text);
} catch {
  failures.push('Public /api/health did not return valid JSON.');
}

const versionHeader = healthResult.response.headers.get('x-aimleads-version');
const commitHeader = healthResult.response.headers.get('x-aimleads-commit');
const builtAtHeader = healthResult.response.headers.get('x-aimleads-built-at');
const cacheControl = healthResult.response.headers.get('cache-control');

const buildMetaVersion = html.match(/<meta name="aimleads-build-version" content="([^"]*)"/i)?.[1] || '';
const buildMetaCommit = html.match(/<meta name="aimleads-build-commit" content="([^"]*)"/i)?.[1] || '';
const buildMetaBuiltAt = html.match(/<meta name="aimleads-build-time" content="([^"]*)"/i)?.[1] || '';

if (!versionHeader) failures.push('Missing X-AimLeads-Version header on /api/health.');
if (!builtAtHeader) failures.push('Missing X-AimLeads-Built-At header on /api/health.');
if (!cacheControl || !/no-cache|no-store/i.test(cacheControl)) {
  failures.push('Public /api/health is not explicitly marked as non-cacheable.');
}
if (!buildMetaVersion) failures.push('Missing aimleads-build-version meta tag on the public HTML.');
if (!healthPayload?.build?.version) failures.push('Public /api/health payload is missing build.version.');

if (expectedVersion && versionHeader && versionHeader !== expectedVersion) {
  failures.push(`Public version header (${versionHeader}) does not match expected APP_VERSION (${expectedVersion}).`);
}
if (expectedVersion && healthPayload?.build?.version && healthPayload.build.version !== expectedVersion) {
  failures.push(`Public health build.version (${healthPayload.build.version}) does not match expected APP_VERSION (${expectedVersion}).`);
}
if (expectedCommit && commitHeader && !String(commitHeader).startsWith(String(expectedCommit).slice(0, 7))) {
  failures.push(`Public commit header (${commitHeader}) does not match expected APP_COMMIT_SHA (${expectedCommit}).`);
}
if (expectedCommit && buildMetaCommit && !String(buildMetaCommit).startsWith(String(expectedCommit).slice(0, 7))) {
  failures.push(`Public HTML build commit (${buildMetaCommit}) does not match expected APP_COMMIT_SHA (${expectedCommit}).`);
}

printSection('Public HTML', [
  `status: ${htmlResult.response.status}`,
  `build meta version: ${buildMetaVersion || '(missing)'}`,
  `build meta commit: ${buildMetaCommit || '(missing)'}`,
  `build meta builtAt: ${buildMetaBuiltAt || '(missing)'}`,
]);

printSection('Public /api/health', [
  `status: ${healthResult.response.status}`,
  `X-AimLeads-Version: ${versionHeader || '(missing)'}`,
  `X-AimLeads-Commit: ${commitHeader || '(missing)'}`,
  `X-AimLeads-Built-At: ${builtAtHeader || '(missing)'}`,
  `Cache-Control: ${cacheControl || '(missing)'}`,
  `payload build.version: ${healthPayload?.build?.version || '(missing)'}`,
  `payload build.commitSha: ${healthPayload?.build?.commitSha || '(missing)'}`,
  `payload build.builtAt: ${healthPayload?.build?.builtAt || '(missing)'}`,
]);

if (failures.length > 0) {
  printSection('Failures', failures);
  process.exitCode = 1;
} else {
  console.log('\nLive deploy verification passed.');
}
