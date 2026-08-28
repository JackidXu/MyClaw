import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';

import { BrowserCredentialLoginTool } from '../../shared/browserCredentials/constants';
import { resolveLobsterBrowserMcpCommand } from './lobsterBrowserMcpServer';

const createdDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lobster-browser-mcp-'));
  createdDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('resolveLobsterBrowserMcpCommand', () => {
  test('generates a self-contained Windows launcher and private runtime descriptor', () => {
    const baseDir = createTempDirectory();
    const bridgeSecret = 'runtime-only-secret';
    const command = resolveLobsterBrowserMcpCommand(baseDir, {
      electronNodeRuntimePath: 'C:\\Program Files\\LobsterAI 100%\\LobsterAI.exe',
      bridgeUrl: 'http://127.0.0.1:61234/browser/tool',
      bridgeSecret,
      platform: 'win32',
    });

    const launcher = fs.readFileSync(command, 'utf8');
    const serverDir = path.dirname(command);
    const runtimeConfig = JSON.parse(fs.readFileSync(
      path.join(serverDir, 'lobster-browser-mcp-runtime.json'),
      'utf8',
    ));

    expect(path.extname(command)).toBe('.cmd');
    expect(launcher).toContain('"C:\\Program Files\\LobsterAI 100%%\\LobsterAI.exe"');
    expect(launcher).toContain('set "ELECTRON_RUN_AS_NODE=1"');
    expect(launcher).not.toContain('LOBSTERAI_ELECTRON_PATH');
    expect(launcher).not.toContain(bridgeSecret);
    expect(runtimeConfig).toEqual({
      version: 1,
      bridgeUrl: 'http://127.0.0.1:61234/browser/tool',
      bridgeSecret,
    });
  });

  test.each(['darwin', 'linux'] as const)(
    'generates a self-contained %s launcher with safely quoted app paths',
    platform => {
      const baseDir = createTempDirectory();
      const runtimePath = "/Applications/Lobster AI/O'Brien Helper.app/Contents/MacOS/O'Brien Helper";
      const command = resolveLobsterBrowserMcpCommand(baseDir, {
        electronNodeRuntimePath: runtimePath,
        bridgeUrl: 'http://127.0.0.1:61234/browser/tool',
        bridgeSecret: 'runtime-only-secret',
        platform,
      });

      const launcher = fs.readFileSync(command, 'utf8');

      expect(path.basename(command)).toBe('lobster-browser-mcp');
      expect(launcher).toContain("'/Applications/Lobster AI/O'\"'\"'Brien Helper.app/Contents/MacOS/O'\"'\"'Brien Helper'");
      expect(launcher).toContain('ELECTRON_RUN_AS_NODE=1');
      expect(launcher).not.toContain('LOBSTERAI_ELECTRON_PATH');
    },
  );

  test('starts with the MCP SDK restricted environment without LobsterAI variables', async () => {
    const baseDir = createTempDirectory();
    const bridgeSecret = 'runtime-only-secret';
    const receivedSecrets: string[] = [];
    const bridgeServer = http.createServer((request, response) => {
      receivedSecrets.push(String(request.headers['x-mcp-bridge-secret'] || ''));
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          content: [{ type: 'text', text: 'No pages are open.' }],
          structuredContent: { pages: [] },
        }));
      });
    });
    await new Promise<void>((resolve, reject) => {
      bridgeServer.once('error', reject);
      bridgeServer.listen(0, '127.0.0.1', resolve);
    });
    const address = bridgeServer.address() as AddressInfo;
    const bridgeUrl = `http://127.0.0.1:${address.port}/browser/tool`;
    const command = resolveLobsterBrowserMcpCommand(baseDir, {
      electronNodeRuntimePath: process.execPath,
      bridgeUrl,
      bridgeSecret,
    });
    const transport = new StdioClientTransport({
      command,
      args: [
        '--autoConnect',
        '--no-usage-statistics',
        '--experimentalStructuredContent',
        '--experimental-page-id-routing',
        `--lobster-bridge-url=${bridgeUrl}`,
      ],
      stderr: 'pipe',
    });
    const stderr: string[] = [];
    transport.stderr?.on('data', chunk => stderr.push(String(chunk)));
    const client = new Client({ name: 'lobster-browser-test', version: '1.0.0' }, {});

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map(tool => tool.name)).toContain('list_pages');
      expect(tools.tools.map(tool => tool.name)).toContain('click');
      const savedLoginTool = tools.tools.find(tool => tool.name === BrowserCredentialLoginTool.Name);
      expect(savedLoginTool?.description).toContain('password is never returned to the Agent');
      const result = await client.callTool({ name: 'list_pages', arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual({ pages: [] });
    } finally {
      await client.close().catch(() => {});
      await new Promise<void>(resolve => bridgeServer.close(() => resolve()));
    }

    expect(receivedSecrets).toEqual([bridgeSecret]);
    expect(stderr.join('')).not.toContain('LOBSTERAI_ELECTRON_PATH is not set');
  }, 15_000);

  test('rejects incomplete runtime configuration', () => {
    const baseDir = createTempDirectory();

    expect(() => resolveLobsterBrowserMcpCommand(baseDir, {
      electronNodeRuntimePath: '',
      bridgeUrl: 'http://127.0.0.1:61234/browser/tool',
      bridgeSecret: 'secret',
    })).toThrow('Electron Node runtime path');
    expect(() => resolveLobsterBrowserMcpCommand(baseDir, {
      electronNodeRuntimePath: process.execPath,
      bridgeUrl: '',
      bridgeSecret: 'secret',
    })).toThrow('active browser bridge');
  });
});
