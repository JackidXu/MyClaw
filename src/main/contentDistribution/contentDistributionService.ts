import { execFileSync, spawnSync } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';

import {
  defaultYixiaoerConfig,
  type YixiaoerConfig,
  type YxerCliInstallResult,
  type YxerCliStatus,
} from '../../shared/contentDistribution/constants';
import { getSkillsRoot } from '../libs/coworkUtil';
import type { SqliteStore } from '../sqliteStore';

export class ContentDistributionService {
  constructor(_getStore?: () => SqliteStore | null) {
    this.syncEnv();
  }

  /**
   * 官方 CLI 配置文件路径 (~/.yxer/config.json)
   */
  private getOfficialConfigPath(): string {
    return path.join(os.homedir(), '.yxer', 'config.json');
  }

  /**
   * 获取技能根目录路径（内含 schemas 与 references）
   */
  public getBuiltinSkillDir(): string {
    return path.join(getSkillsRoot(), 'yixiaoer');
  }

  /**
   * 获取本应用托管的 bin 目录 (~/Library/Application Support/HeyClaw/bin 或 %APPDATA%/HeyClaw/bin)
   */
  public getManagedBinDir(): string {
    return path.join(app.getPath('userData'), 'bin');
  }

  /**
   * 获取托管的 yxer 可执行文件路径
   */
  public getManagedYxerPath(): string {
    const binaryName = process.platform === 'win32' ? 'yxer.exe' : 'yxer';
    return path.join(this.getManagedBinDir(), binaryName);
  }

  /**
   * 解析 SKILL.md 中声明的基准版本号（若解析失败则回退默认版本 3.2.26）
   */
  public getYixiaoerTargetVersion(): string {
    try {
      const skillMdPath = path.join(this.getBuiltinSkillDir(), 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const match = content.match(/version:\s*([0-9.]+)/i);
        if (match?.[1]) {
          return match[1].trim();
        }
      }
    } catch (err) {
      console.warn('[ContentDistribution] 读取 SKILL.md 版本号失败:', err);
    }
    return '3.2.26';
  }

  /**
   * 检查 yxer CLI 是否已就绪并获取版本与路径
   */
  public async checkYxerCli(): Promise<YxerCliStatus> {
    const managedPath = this.getManagedYxerPath();
    if (fs.existsSync(managedPath)) {
      try {
        const res = spawnSync(managedPath, ['--version'], {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        });
        if (res.status === 0) {
          const version = (res.stdout || '').trim();
          return {
            installed: true,
            version: version || this.getYixiaoerTargetVersion(),
            path: managedPath,
            isManaged: true,
          };
        }
      } catch (err) {
        console.warn('[ContentDistribution] 托管 yxer 执行校验失败:', err);
      }
    }

    // 检查系统 PATH 中的 yxer (兼顾开发者本地全局安装)
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    try {
      const whichRes = spawnSync(whichCmd, ['yxer'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      });
      if (whichRes.status === 0) {
        const resolvedPath = whichRes.stdout.trim().split(/\r?\n/)[0];
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          const verRes = spawnSync(resolvedPath, ['--version'], {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
          });
          const version = (verRes.stdout || '').trim();
          return {
            installed: true,
            version: version || this.getYixiaoerTargetVersion(),
            path: resolvedPath,
            isManaged: false,
          };
        }
      }
    } catch {
      // 忽略未找到
    }

    return { installed: false };
  }

  /**
   * 根据当前系统架构自动下载并解压官方 yxer 二进制至应用托管目录
   */
  public async ensureYxerCli(force = false): Promise<YxerCliInstallResult> {
    if (!force) {
      const current = await this.checkYxerCli();
      if (current.installed) {
        return {
          success: true,
          version: current.version,
          path: current.path,
        };
      }
    }

    const platformMap: Record<string, string> = {
      darwin: 'darwin',
      linux: 'linux',
      win32: 'windows',
    };
    const archMap: Record<string, string> = {
      x64: 'amd64',
      arm64: 'arm64',
    };

    const mappedPlatform = platformMap[process.platform];
    const mappedArch = archMap[process.arch];

    if (!mappedPlatform || !mappedArch) {
      return {
        success: false,
        error: `当前操作系统平台或架构暂不支持自动下载分发环境: ${process.platform}/${process.arch}`,
      };
    }

    const version = this.getYixiaoerTargetVersion();
    const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
    const archiveName = `yxer-cli-${version}-${mappedPlatform}-${mappedArch}.${ext}`;
    const primaryUrl = `https://scrm0.cdn.banchengyun.com/heyclaw/yxer/releases/v${version}/${archiveName}`;
    const fallbackUrl = `https://yixiaoer-lite-asserts.tos-cn-shanghai.volces.com/yxer/releases/v${version}/${archiveName}`;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heyclaw-yxer-'));
    const archivePath = path.join(tempDir, archiveName);
    const extractDir = path.join(tempDir, 'extracted');

    try {
      console.log(`[ContentDistribution] 开始下载 yxer CLI: ${primaryUrl}`);
      try {
        await this.downloadFile(primaryUrl, archivePath);
      } catch (primaryErr) {
        console.warn(`[ContentDistribution] 自建 OSS 下载失败，尝试从官方 TOS 兜底拉取:`, primaryErr);
        if (fs.existsSync(archivePath)) {
          try {
            fs.unlinkSync(archivePath);
          } catch {
            // ignore
          }
        }
        await this.downloadFile(fallbackUrl, archivePath);
      }

      fs.mkdirSync(extractDir, { recursive: true });

      if (process.platform === 'win32') {
        const psCommand = `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${extractDir}' -Force`;
        execFileSync(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
          { stdio: 'ignore', windowsHide: true },
        );
      } else {
        execFileSync('tar', ['-xzf', archivePath, '-C', extractDir], { stdio: 'ignore' });
      }

      const binaryName = process.platform === 'win32' ? 'yxer.exe' : 'yxer';
      const extractedBinaryPath = this.findFileRecursively(extractDir, binaryName);

      if (!extractedBinaryPath || !fs.existsSync(extractedBinaryPath)) {
        return {
          success: false,
          error: `下载压缩包中未找到 ${binaryName} 可执行文件`,
        };
      }

      const managedBinDir = this.getManagedBinDir();
      fs.mkdirSync(managedBinDir, { recursive: true });

      const targetPath = this.getManagedYxerPath();
      fs.copyFileSync(extractedBinaryPath, targetPath);

      if (process.platform !== 'win32') {
        fs.chmodSync(targetPath, 0o755);
      }

      const status = await this.checkYxerCli();
      if (!status.installed) {
        return {
          success: false,
          error: '安装完成后验证 CLI 运行环境失败',
        };
      }

      console.log(`[ContentDistribution] yxer CLI 安装就绪: ${targetPath} (v${status.version})`);
      return {
        success: true,
        version: status.version,
        path: targetPath,
      };
    } catch (err) {
      console.error('[ContentDistribution] 自动准备 yxer 运行环境失败:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : '下载或解压分发环境失败',
      };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('下载重定向次数过多'));
          return;
        }

        const parsedUrl = new URL(requestUrl);
        const request = https.get(
          {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            headers: {
              'User-Agent': 'HeyClaw-Desktop-App',
            },
          },
          (response) => {
            if (
              response.statusCode &&
              response.statusCode >= 300 &&
              response.statusCode < 400 &&
              response.headers.location
            ) {
              const redirectUrl = new URL(response.headers.location, requestUrl).toString();
              handleRequest(redirectUrl, redirectCount + 1);
              return;
            }

            if (response.statusCode !== 200) {
              reject(new Error(`下载失败，HTTP 状态码: ${response.statusCode}`));
              return;
            }

            const fileStream = fs.createWriteStream(destPath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close(() => resolve());
            });

            fileStream.on('error', (err) => {
              fs.unlink(destPath, () => reject(err));
            });
          },
        );

        request.on('error', (err) => {
          fs.unlink(destPath, () => reject(err));
        });
      };

      handleRequest(url);
    });
  }

  private findFileRecursively(dir: string, targetName: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = this.findFileRecursively(fullPath, targetName);
        if (found) return found;
      } else if (entry.name.toLowerCase() === targetName.toLowerCase()) {
        return fullPath;
      }
    }
    return null;
  }

  /**
   * 直接从官方 ~/.yxer/config.json 读取配置
   */
  public getConfig(): YixiaoerConfig {
    const configPath = this.getOfficialConfigPath();
    if (!fs.existsSync(configPath)) {
      return { ...defaultYixiaoerConfig };
    }
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const raw = JSON.parse(content) as {
        apiKey?: string;
        localPublishClientId?: string;
      };
      const apiKey = typeof raw?.apiKey === 'string' ? raw.apiKey.trim() : '';
      const clientId =
        typeof raw?.localPublishClientId === 'string'
          ? raw.localPublishClientId.trim()
          : '';
      return {
        apiKey,
        clientId,
        enabled: Boolean(apiKey),
      };
    } catch (err) {
      console.warn('[ContentDistribution] 读取官方 yxer 配置文件失败:', err);
      return { ...defaultYixiaoerConfig };
    }
  }

  /**
   * 直接持久化保存至官方 ~/.yxer/config.json 并同步运行环境变量
   */
  public saveConfig(partial: Partial<YixiaoerConfig>): { success: boolean; error?: string } {
    try {
      const current = this.getConfig();
      const updated: YixiaoerConfig = {
        apiKey: typeof partial.apiKey === 'string' ? partial.apiKey.trim() : current.apiKey,
        clientId: typeof partial.clientId === 'string' ? partial.clientId.trim() : current.clientId,
        enabled:
          typeof partial.enabled === 'boolean'
            ? partial.enabled
            : Boolean(partial.apiKey?.trim() || current.apiKey),
      };

      const configPath = this.getOfficialConfigPath();
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let existingJson: Record<string, any> = {};
      if (fs.existsSync(configPath)) {
        try {
          existingJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch {
          existingJson = {};
        }
      }

      existingJson.apiKey = updated.apiKey;
      existingJson.localPublishClientId = updated.clientId;

      fs.writeFileSync(configPath, JSON.stringify(existingJson, null, 2), 'utf8');

      this.syncEnv(updated);

      return { success: true };
    } catch (error) {
      console.error('[ContentDistribution] 保存官方 yxer 配置失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '保存配置失败',
      };
    }
  }

  private syncEnv(customConfig?: YixiaoerConfig): void {
    const config = customConfig ?? this.getConfig();
    if (config.apiKey) {
      process.env.YIXIAOER_API_KEY = config.apiKey;
    } else {
      delete process.env.YIXIAOER_API_KEY;
    }

    if (config.clientId) {
      process.env.YIXIAOER_CLIENT_ID = config.clientId;
    } else {
      delete process.env.YIXIAOER_CLIENT_ID;
    }

    process.env.YIXIAOER_PROJECT_DIR = this.getBuiltinSkillDir();
  }
}
