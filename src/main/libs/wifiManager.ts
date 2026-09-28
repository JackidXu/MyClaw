import { execFile } from 'child_process';
import * as dns from 'dns';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * 跨平台系统 Wi-Fi 管理服务（macOS / Windows）
 * 专供录音卡热点极速自动连接与恢复
 */
class WifiManager {
  private cachedWifiDevice: string | null = null;

  /**
   * 获取 macOS Wi-Fi 硬件接口设备名（如 en0）
   */
  async getMacWifiDevice(): Promise<string> {
    if (this.cachedWifiDevice) return this.cachedWifiDevice;
    try {
      const { stdout } = await execFileAsync('networksetup', ['-listallhardwareports']);
      const blocks = stdout.split(/Hardware Port:\s*/i);
      for (const block of blocks) {
        if (/Wi-Fi|AirPort/i.test(block)) {
          const m = block.match(/Device:\s*([a-zA-Z0-9]+)/);
          if (m && m[1]) {
            this.cachedWifiDevice = m[1].trim();
            return this.cachedWifiDevice;
          }
        }
      }
    } catch {
      // 忽略
    }
    this.cachedWifiDevice = 'en0';
    return 'en0';
  }

  /**
   * 获取当前电脑所连接的 Wi-Fi 名称（SSID）
   */
  async getCurrentWifi(): Promise<string | null> {
    const platform = process.platform;
    try {
      if (platform === 'darwin') {
        const device = await this.getMacWifiDevice();
        const { stdout } = await execFileAsync('networksetup', ['-getairportnetwork', device]);
        const m = stdout.match(/Current Wi-Fi Network:\s*(.+)/i);
        if (m && m[1]) {
          const ssid = m[1].trim();
          if (ssid && !ssid.includes('not associated')) {
            return ssid;
          }
        }
        return null;
      }

      if (platform === 'win32') {
        const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'interfaces']);
        const m = stdout.match(/\bSSID\s*:\s*(.+)/i);
        if (m && m[1]) {
          const ssid = m[1].trim();
          if (ssid && ssid !== '') {
            return ssid;
          }
        }
        return null;
      }
    } catch {
      // 忽略
    }
    return null;
  }

  /**
   * 检查宿主机操作系统是否已经保存过该 Wi-Fi 热点的密码/配置文件
   * 用于新老用户精准分流：
   * - 若已保存 (老用户)：优先享受无感免密自动切网；
   * - 若未保存 (新用户 / 移除过网络)：0 延迟直接弹窗展示手动向导，省去徒劳无功的自动切网尝试。
   */
  async hasSavedWifiProfile(ssid: string): Promise<boolean> {
    const cleanSsid = ssid.trim();
    if (!cleanSsid) return false;
    const platform = process.platform;

    try {
      if (platform === 'darwin') {
        const device = await this.getMacWifiDevice();
        const { stdout } = await execFileAsync('networksetup', ['-listpreferredwirelessnetworks', device]);
        // 按行精确匹配，杜绝子串误判
        const lines = stdout.split('\n').map((l) => l.trim());
        return lines.includes(cleanSsid);
      }

      if (platform === 'win32') {
        const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'profile', `name=${cleanSsid}`]);
        return !stdout.includes('not found') && !stdout.includes('找不到');
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * 解析连接录音卡所需的 Socket 目标端点与出口网卡 IP（防多网卡/有线网路由冲突）
   */
  async resolveRecorderEndpoints(): Promise<{ targetIp: string; localIp?: string }> {
    let targetIp = '192.168.1.1';
    let localIp: string | undefined;

    try {
      if (process.platform === 'darwin') {
        const router = await this.getMacWifiRouter().catch((): string | null => null);
        if (router && net.isIP(router)) {
          targetIp = router;
        }
        const device = await this.getMacWifiDevice().catch((): string => 'en0');
        const ifaces = os.networkInterfaces();
        const targetIface = ifaces[device];
        if (targetIface) {
          const ipv4 = targetIface.find(
            (i) => i.family === 'IPv4' && !i.internal && i.address.startsWith('192.168.1.')
          );
          if (ipv4) localIp = ipv4.address;
        }
        if (!localIp) {
          for (const name of Object.keys(ifaces)) {
            const ipv4 = (ifaces[name] || []).find(
              (i) => i.family === 'IPv4' && !i.internal && i.address.startsWith('192.168.1.')
            );
            if (ipv4) {
              localIp = ipv4.address;
              break;
            }
          }
        }
      } else if (process.platform === 'win32') {
        const ifaces = os.networkInterfaces();
        for (const name of Object.keys(ifaces)) {
          const ipv4 = (ifaces[name] || []).find(
            (i) => i.family === 'IPv4' && !i.internal && i.address.startsWith('192.168.1.')
          );
          if (ipv4) {
            localIp = ipv4.address;
            break;
          }
        }
      }
    } catch {
      // 忽略探测异常，使用默认值
    }

    return { targetIp, localIp };
  }

  /**
   * 权威探测是否已连入录音卡局域网且服务端口可达
   * 动态解析真实网关并强制绑定无线网卡出口 IP（localAddress），杜绝多网卡（有线网/VPN）路由抢占导致的 EHOSTUNREACH
   */
  async isRecorderReachable(timeoutMs = 600): Promise<boolean> {
    const { targetIp, localIp } = await this.resolveRecorderEndpoints();
    // 尚未拿到 192.168.1.x IP 时直接返回不可达，绝不走默认路由被 TUN 代理拦截
    if (!localIp) {
      return false;
    }

    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (result: boolean) => {
        if (!settled) {
          settled = true;
          socket.removeAllListeners();
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));

      try {
        const connectOptions: net.TcpSocketConnectOpts = {
          port: 32769,
          host: targetIp,
          localAddress: localIp,
        };
        socket.connect(connectOptions);
      } catch {
        finish(false);
      }
    });
  }

  /**
   * 获取 macOS Wi-Fi 当前分配的网关 IP（如 192.168.1.1）
   */
  async getMacWifiRouter(): Promise<string | null> {
    if (process.platform !== 'darwin') return null;
    try {
      const device = await this.getMacWifiDevice();
      const { stdout } = await execFileAsync('ipconfig', ['getoption', device, 'router']);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * 自动连接指定 Wi-Fi 热点（macOS / Windows）
   *
   * @param ssid Wi-Fi 热点名称
   * @param password Wi-Fi 密码
   * @param timeoutMs 超时时间（毫秒），默认 16000ms（留足操作系统底层关联与 DHCP 时间）
   */
  async connectWifi(
    ssid: string,
    password?: string,
    timeoutMs = 16000
  ): Promise<{ success: boolean; error?: string }> {
    const platform = process.platform;
    const cleanSsid = ssid.trim();
    const cleanPassword = password ? password.trim() : '';

    if (!cleanSsid) {
      return { success: false, error: 'SSID 不能为空' };
    }

    try {
      // 预先检查：只有当系统能明确读到当前 SSID 且与目标一致时，才直接返回成功
      // 绝不能仅凭网关是 192.168.1.1 就跳过，因为家用路由器的默认网关绝大多数都是 192.168.1.1！
      const initialSsid = await this.getCurrentWifi().catch((): string | null => null);
      if (initialSsid && initialSsid === cleanSsid) {
        return { success: true };
      }

      if (platform === 'darwin') {
        // 若未显式传入密码，属于已保存凭证的免密直连：
        // macOS 系统 CoreWLAN 会自动利用已存钥匙串凭据接入热点，无需调用必报 -3900 的 networksetup，直接依靠权威端口探针验证连通
        if (!cleanPassword) {
          const deadline = Date.now() + 10000;
          while (Date.now() < deadline) {
            if (await this.isRecorderReachable(600)) {
              return { success: true };
            }
            const cur = await this.getCurrentWifi().catch((): string | null => null);
            if (cur === cleanSsid) {
              return { success: true };
            }
            await new Promise((r) => setTimeout(r, 600));
          }

          if (await this.isRecorderReachable(800)) {
            return { success: true };
          }
          return {
            success: false,
            error: `系统自动免密连入 Wi-Fi 热点 (${cleanSsid}) 超时`,
          };
        }

        // 若传入了密码，调用 networksetup 发起显式连接
        const device = await this.getMacWifiDevice();
        const args = ['-setairportnetwork', device, cleanSsid, cleanPassword];

        let triggerSuccess = false;
        let lastErr: any = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const { stdout, stderr } = await execFileAsync('networksetup', args);
            const output = `${stdout || ''} ${stderr || ''}`.trim();
            if (
              output.includes('Could not find') ||
              output.includes('Failed to join') ||
              output.includes('Error:') ||
              output.includes('3900')
            ) {
              lastErr = new Error(output);
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
            triggerSuccess = true;
            break;
          } catch (err: any) {
            lastErr = err;
            const errMsg = String(err?.message || err);
            if (
              errMsg.includes('3900') ||
              errMsg.includes('Could not find network') ||
              errMsg.includes('Failed to join')
            ) {
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
            break;
          }
        }

        if (!triggerSuccess) {
          return {
            success: false,
            error: lastErr?.message || `系统未能加入 Wi-Fi 热点: ${cleanSsid}`,
          };
        }

        return { success: true };
      }

      if (platform === 'win32') {
        // 1. 检查是否存在同名 profile
        let hasProfile = false;
        try {
          const { stdout } = await execFileAsync('netsh', ['wlan', 'show', 'profile', `name=${cleanSsid}`]);
          if (!stdout.includes('not found') && !stdout.includes('找不到')) {
            hasProfile = true;
          }
        } catch {
          hasProfile = false;
        }

        // 2. 如果不存在 profile 且有密码，动态生成并导入标准 WPA2PSK Profile
        if (!hasProfile && cleanPassword) {
          const xmlContent = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>${cleanSsid}</name>
    <SSIDConfig>
        <SSID>
            <name>${cleanSsid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>manual</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>${cleanPassword}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>`;
          const tempPath = path.join(os.tmpdir(), `heyclaw_wifi_${Date.now()}.xml`);
          try {
            await fs.promises.writeFile(tempPath, xmlContent, 'utf-8');
            await execFileAsync('netsh', ['wlan', 'add', 'profile', `filename=${tempPath}`]);
          } finally {
            fs.promises.unlink(tempPath).catch(() => {});
          }
        }

        // 3. 执行连接命令
        await execFileAsync('netsh', ['wlan', 'connect', `name=${cleanSsid}`]);

        // 4. 轮询验证是否已关联成功
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
          if (await this.isRecorderReachable(500)) {
            return { success: true };
          }
          const current = await this.getCurrentWifi();
          if (current === cleanSsid) {
            return { success: true };
          }
          await new Promise((r) => setTimeout(r, 800));
        }

        const finalCheck = await this.getCurrentWifi();
        if (finalCheck === cleanSsid || (await this.isRecorderReachable(800))) {
          return { success: true };
        }
        return { success: false, error: `连接超时（目标热点: ${cleanSsid}）` };
      }

      return { success: false, error: `当前操作系统平台 (${platform}) 不支持自动连接 Wi-Fi` };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * 恢复连接原有 Wi-Fi 网络（极速切回外网）
   */
  async restoreWifi(targetSsid: string): Promise<boolean> {
    const platform = process.platform;
    const cleanSsid = targetSsid.trim();
    if (!cleanSsid) return false;

    try {
      if (platform === 'darwin') {
        const device = await this.getMacWifiDevice();
        await execFileAsync('networksetup', ['-setairportnetwork', device, cleanSsid]);
        return true;
      }
      if (platform === 'win32') {
        await execFileAsync('netsh', ['wlan', 'connect', `name=${cleanSsid}`]);
        return true;
      }
    } catch {
      // 忽略
    }
    return false;
  }

  /**
   * 权威探测宿主机当前是否真正连通公网互联网（纯底层原生探针，零业务侵入，零红字）
   */
  async isInternetOnline(timeoutMs = 1200): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      };

      const timer = setTimeout(() => finish(false), timeoutMs);

      // 优先解析国内高可用权威域名，秒级返回
      dns.lookup('qq.com', (err) => {
        if (!err) {
          return finish(true);
        }
        // 容灾备用探针（Apple 原生探针域名）
        dns.lookup('captive.apple.com', (err2) => {
          finish(!err2);
        });
      });
    });
  }
}

export const wifiManager = new WifiManager();
