'use strict';

const { normalizeKeyfrom } = require('./build-keyfrom.cjs');

// Add production channels here when they must install silently even when the
// user double-clicks the installer instead of passing /S.
const SILENT_ON_DOUBLE_CLICK_KEYFROMS = new Set([
  'dictbind',
]);

function resolveChannelInstallPolicy(keyfrom) {
  const normalizedKeyfrom = normalizeKeyfrom(keyfrom);
  const configured = SILENT_ON_DOUBLE_CLICK_KEYFROMS.has(normalizedKeyfrom);

  return {
    keyfrom: normalizedKeyfrom,
    silentOnDoubleClick: configured,
    source: configured ? 'channel-policy' : 'default',
  };
}

module.exports = {
  SILENT_ON_DOUBLE_CLICK_KEYFROMS,
  resolveChannelInstallPolicy,
};
