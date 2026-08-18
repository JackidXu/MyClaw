import { spawnSync } from 'node:child_process';

import { describe, expect, test } from 'vitest';

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

describe('channel installer build flags', () => {
  test('keeps channel builds interactive unless the silent flag is explicit', () => {
    const plain = runChannelDryRun(['--keyfrom', 'dictbind']);

    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain('keyfrom=dictbind');
    expect(plain.stdout).toContain('silentOnDoubleClick=false source=default');
  });

  test('enables double-click silent install from an explicit build flag', () => {
    const silent = runChannelDryRun(['--keyfrom', 'dictbind', '--silent']);

    expect(silent.status).toBe(0);
    expect(silent.stdout).toContain('keyfrom=dictbind');
    expect(silent.stdout).toContain('silentOnDoubleClick=true source=cli');
  });

  test('does not leak inherited build env into a channel dry-run', () => {
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
