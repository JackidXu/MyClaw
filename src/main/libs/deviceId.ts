import crypto from 'crypto';
import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface DeviceInfo {
  deviceId: string;
  platform: string;
  hostname: string;
}

let cachedDeviceInfo: DeviceInfo | null = null;

export function getDeviceInfo(): DeviceInfo {
  if (cachedDeviceInfo) {
    return cachedDeviceInfo;
  }

  const userDataPath = app.getPath('userData');
  const deviceIdFilePath = path.join(userDataPath, 'device.id');

  let deviceId = '';

  try {
    if (fs.existsSync(deviceIdFilePath)) {
      deviceId = fs.readFileSync(deviceIdFilePath, 'utf8').trim();
    }
  } catch (err) {
    console.warn('[deviceId] Failed to read device.id file:', err);
  }

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    try {
      fs.writeFileSync(deviceIdFilePath, deviceId, 'utf8');
      console.log('[deviceId] Generated and saved new deviceId:', deviceId);
    } catch (err) {
      console.error('[deviceId] Failed to write device.id file:', err);
    }
  }

  cachedDeviceInfo = {
    deviceId,
    platform: process.platform,
    hostname: os.hostname(),
  };

  return cachedDeviceInfo;
}
