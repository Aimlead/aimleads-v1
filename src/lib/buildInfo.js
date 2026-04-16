const version = import.meta.env.VITE_APP_VERSION || import.meta.env.npm_package_version || 'dev';
const builtAt = import.meta.env.VITE_APP_BUILD_TIME || '';
const commitSha = import.meta.env.VITE_APP_COMMIT_SHA || '';

const formatBuiltAt = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
};

export const BUILD_INFO = {
  version,
  builtAt: formatBuiltAt(builtAt),
  commitSha,
  commitShort: commitSha ? commitSha.slice(0, 7) : '',
};

export const getBuildLabel = () => {
  const commitLabel = BUILD_INFO.commitShort ? ` · ${BUILD_INFO.commitShort}` : '';
  return `v${BUILD_INFO.version}${commitLabel}`;
};
