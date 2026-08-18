import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);

type ChannelInstallPolicy = {
  keyfrom: string;
  silentOnDoubleClick: boolean;
  source: 'channel-policy' | 'default';
};

const {
  SILENT_ON_DOUBLE_CLICK_KEYFROMS,
  resolveChannelInstallPolicy,
} = require('../scripts/channel-install-policy.cjs') as {
  SILENT_ON_DOUBLE_CLICK_KEYFROMS: Set<string>;
  resolveChannelInstallPolicy: (
    keyfrom: string,
  ) => ChannelInstallPolicy;
};

const runChannelDryRun = (args: string[], env: NodeJS.ProcessEnv = {}) => (
  spawnSync(process.execPath, ['scripts/dist-win-channel.cjs', ...args, '--dry-run'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  })
);

describe('channel install policy', () => {
  test('keeps dictbind as the only production double-click silent channel', () => {
    expect([...SILENT_ON_DOUBLE_CLICK_KEYFROMS]).toEqual(['dictbind']);
    expect(resolveChannelInstallPolicy('dictbind')).toEqual({
      keyfrom: 'dictbind',
      silentOnDoubleClick: true,
      source: 'channel-policy',
    });
  });

  test('defaults unconfigured channels to the interactive double-click installer', () => {
    expect(resolveChannelInstallPolicy('ci_plain_channel')).toEqual({
      keyfrom: 'ci_plain_channel',
      silentOnDoubleClick: false,
      source: 'default',
    });
  });

  test('does not leak inherited build env into an unconfigured channel dry-run', () => {
    const inherited = runChannelDryRun(['--keyfrom', 'ci_plain_channel'], {
      LOBSTERAI_CHANNEL_BUILD: '1',
      LOBSTERAI_SILENT_ON_DOUBLE_CLICK: '1',
    });
    expect(inherited.status).toBe(0);
    expect(inherited.stdout).toContain('silentOnDoubleClick=false source=default');
    expect(inherited.stderr).toContain('ignoring inherited LOBSTERAI_CHANNEL_BUILD=1');
    expect(inherited.stderr).toContain('ignoring inherited LOBSTERAI_SILENT_ON_DOUBLE_CLICK=1');
  });
});
