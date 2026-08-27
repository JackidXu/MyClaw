import fs from 'fs';
import path from 'path';

const SERVER_FILE_NAME = 'lobster-browser-mcp-server.mjs';
const RUNTIME_CONFIG_FILE_NAME = 'lobster-browser-mcp-runtime.json';
const WINDOWS_LAUNCHER_FILE_NAME = 'lobster-browser-mcp.cmd';
const POSIX_LAUNCHER_FILE_NAME = 'lobster-browser-mcp';

export interface LobsterBrowserMcpLaunchOptions {
  electronNodeRuntimePath: string;
  bridgeUrl: string;
  bridgeSecret: string;
  platform?: NodeJS.Platform;
}

const MCP_SERVER_SOURCE = String.raw`import fs from 'node:fs/promises';
import readline from 'node:readline';

const runtimeConfig = await fs.readFile(
  new URL('./${RUNTIME_CONFIG_FILE_NAME}', import.meta.url),
  'utf8',
).then((raw) => {
  const parsed = JSON.parse(raw);
  if (
    parsed?.version !== 1
    || typeof parsed.bridgeUrl !== 'string'
    || typeof parsed.bridgeSecret !== 'string'
  ) {
    return null;
  }
  return parsed;
}).catch(() => null);

const bridgeUrlArg = process.argv.find((arg) => arg.startsWith('--lobster-bridge-url='));
const bridgeUrl = bridgeUrlArg
  ? bridgeUrlArg.slice('--lobster-bridge-url='.length)
  : runtimeConfig?.bridgeUrl || '';
const bridgeSecret = runtimeConfig?.bridgeSecret || '';

const tools = [
  ['list_pages', {}],
  ['new_page', { url: { type: 'string' }, timeout: { type: 'number' } }],
  ['select_page', { pageId: { type: 'number' }, bringToFront: { type: 'boolean' } }],
  ['close_page', { pageId: { type: 'number' } }],
  ['navigate_page', { pageId: { type: 'number' }, type: { type: 'string' }, url: { type: 'string' }, timeout: { type: 'number' } }],
  ['take_snapshot', { pageId: { type: 'number' }, verbose: { type: 'boolean' } }],
  ['take_screenshot', { pageId: { type: 'number' }, filePath: { type: 'string' }, format: { type: 'string' }, uid: { type: 'string' }, fullPage: { type: 'boolean' } }],
  ['click', { pageId: { type: 'number' }, uid: { type: 'string' }, dblClick: { type: 'boolean' } }],
  ['fill', { pageId: { type: 'number' }, uid: { type: 'string' }, value: { type: 'string' } }],
  ['fill_form', { pageId: { type: 'number' }, elements: { type: 'array', items: { type: 'object' } } }],
  ['hover', { pageId: { type: 'number' }, uid: { type: 'string' } }],
  ['drag', { pageId: { type: 'number' }, from_uid: { type: 'string' }, to_uid: { type: 'string' } }],
  ['upload_file', { pageId: { type: 'number' }, uid: { type: 'string' }, filePath: { type: 'string' } }],
  ['press_key', { pageId: { type: 'number' }, key: { type: 'string' } }],
  ['resize_page', { pageId: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }],
  ['handle_dialog', { pageId: { type: 'number' }, action: { type: 'string' }, promptText: { type: 'string' } }],
  ['evaluate_script', { pageId: { type: 'number' }, function: { type: 'string' }, args: { type: 'array' } }],
  ['wait_for', { pageId: { type: 'number' }, text: { type: 'string' }, timeout: { type: 'number' } }],
].map(([name, properties]) => ({
  name,
  description: 'Operate the LobsterAI in-app browser.',
  inputSchema: { type: 'object', properties, additionalProperties: true },
}));

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function errorResult(message) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

async function callBridge(name, args) {
  if (!bridgeUrl || !bridgeSecret) {
    return errorResult('LobsterAI browser bridge is not configured.');
  }
  const response = await fetch(bridgeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mcp-bridge-secret': bridgeSecret,
    },
    body: JSON.stringify({ tool: name, args: args || {} }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload.error === 'string'
      ? payload.error
      : 'LobsterAI browser bridge returned HTTP ' + response.status + '.';
    return errorResult(message);
  }
  return payload;
}

async function callTool(name, args) {
  const result = await callBridge(name, args);
  if (name !== 'take_screenshot' || result?.isError) {
    return result;
  }

  const imageBase64 = result?.structuredContent?.imageBase64;
  const format = result?.structuredContent?.format === 'jpeg' ? 'jpeg' : 'png';
  const filePath = typeof args?.filePath === 'string' ? args.filePath : '';
  if (!imageBase64 || !filePath) {
    return errorResult('LobsterAI browser screenshot data or destination path is missing.');
  }
  await fs.writeFile(filePath + '.' + format, Buffer.from(imageBase64, 'base64'));
  return {
    content: [{ type: 'text', text: 'Screenshot saved.' }],
    structuredContent: { message: 'Screenshot saved.' },
  };
}

async function handleRequest(message) {
  if (!message || message.jsonrpc !== '2.0' || !message.method) return;
  if (message.method.startsWith('notifications/')) return;

  let result;
  if (message.method === 'initialize') {
    result = {
      protocolVersion: message.params?.protocolVersion || '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'lobster-browser', version: '1.0.0' },
    };
  } else if (message.method === 'tools/list') {
    result = { tools };
  } else if (message.method === 'tools/call') {
    const name = message.params?.name;
    if (typeof name !== 'string' || !tools.some((tool) => tool.name === name)) {
      result = errorResult('Unknown LobsterAI browser tool.');
    } else {
      result = await callTool(name, message.params?.arguments || {});
    }
  } else if (message.method === 'ping') {
    result = {};
  } else {
    writeMessage({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: 'Method not found' },
    });
    return;
  }

  if (message.id !== undefined) {
    writeMessage({ jsonrpc: '2.0', id: message.id, result });
  }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const message = JSON.parse(trimmed);
    void handleRequest(message).catch((error) => {
      if (message.id !== undefined) {
        writeMessage({
          jsonrpc: '2.0',
          id: message.id,
          result: errorResult(error instanceof Error ? error.message : String(error)),
        });
      }
    });
  } catch (error) {
    process.stderr.write('[LobsterBrowserMcp] Invalid JSON-RPC message: ' + String(error) + '\n');
  }
});
`;

const escapeWindowsBatchValue = (value: string): string => value.replace(/%/g, '%%');

const quotePosixShellValue = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

const buildWindowsLauncherSource = (electronNodeRuntimePath: string): string => [
  '@echo off',
  'setlocal DisableDelayedExpansion',
  'set "ELECTRON_RUN_AS_NODE=1"',
  `"${escapeWindowsBatchValue(electronNodeRuntimePath)}" "%~dp0${SERVER_FILE_NAME}" %*`,
  '',
].join('\r\n');

const buildPosixLauncherSource = (electronNodeRuntimePath: string): string => [
  '#!/bin/sh',
  `exec env ELECTRON_RUN_AS_NODE=1 ${quotePosixShellValue(electronNodeRuntimePath)} "$(dirname "$0")/${SERVER_FILE_NAME}" "$@"`,
  '',
].join('\n');

const writeFileIfChanged = (filePath: string, contents: string, mode?: number): void => {
  let current: string | null = null;
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch {
    // File does not exist yet.
  }
  if (current !== contents) {
    fs.writeFileSync(filePath, contents, {
      encoding: 'utf8',
      ...(mode !== undefined ? { mode } : {}),
    });
  }
  if (mode !== undefined && process.platform !== 'win32') {
    fs.chmodSync(filePath, mode);
  }
};

export const resolveLobsterBrowserMcpCommand = (
  baseDir: string,
  options: LobsterBrowserMcpLaunchOptions,
): string => {
  if (!options.electronNodeRuntimePath.trim()) {
    throw new Error('LobsterAI browser MCP requires an Electron Node runtime path.');
  }
  if (!options.bridgeUrl.trim() || !options.bridgeSecret) {
    throw new Error('LobsterAI browser MCP requires an active browser bridge.');
  }

  const serverDir = path.join(baseDir, 'lobster-browser-mcp');
  fs.mkdirSync(serverDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    fs.chmodSync(serverDir, 0o700);
  }
  writeFileIfChanged(path.join(serverDir, SERVER_FILE_NAME), MCP_SERVER_SOURCE, 0o600);
  writeFileIfChanged(
    path.join(serverDir, RUNTIME_CONFIG_FILE_NAME),
    `${JSON.stringify({
      version: 1,
      bridgeUrl: options.bridgeUrl,
      bridgeSecret: options.bridgeSecret,
    }, null, 2)}\n`,
    0o600,
  );

  if ((options.platform ?? process.platform) === 'win32') {
    const launcherPath = path.join(serverDir, WINDOWS_LAUNCHER_FILE_NAME);
    writeFileIfChanged(
      launcherPath,
      buildWindowsLauncherSource(options.electronNodeRuntimePath),
      0o700,
    );
    return launcherPath;
  }

  const launcherPath = path.join(serverDir, POSIX_LAUNCHER_FILE_NAME);
  writeFileIfChanged(
    launcherPath,
    buildPosixLauncherSource(options.electronNodeRuntimePath),
    0o700,
  );
  return launcherPath;
};
