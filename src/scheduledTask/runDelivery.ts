import { WeixinDeliveryError, WeixinPlugin } from '../shared/im/weixin';
import { PlatformRegistry } from '../shared/platform';
import { DeliveryMode, RunDeliveryStatus, TaskStatus } from './constants';
import type { ScheduledTaskDelivery, ScheduledTaskRun } from './types';

export function hasRunDeliveryFailure(run: ScheduledTaskRun, delivery?: ScheduledTaskDelivery): boolean {
  const channel = run.deliveryChannel
    ?? (delivery?.mode === DeliveryMode.Announce ? delivery.channel : undefined);
  const weixin = channel === WeixinPlugin.Id || channel === PlatformRegistry.platformOfChannel(WeixinPlugin.Id);
  const hasWeixinError = Object.values(WeixinDeliveryError).some(code => run.deliveryError?.includes(code));
  // A silent delivery suppression (e.g. model returned NO_REPLY) is intentional, not a failure.
  if (run.summary?.trim() === 'NO_REPLY') {
    return false;
  }
  return (weixin || hasWeixinError)
    && (Boolean(run.deliveryError) || run.deliveryStatus === RunDeliveryStatus.NotDelivered);
}

export function isWeixinReportDelivery(delivery: ScheduledTaskDelivery): boolean {
  return delivery.mode === DeliveryMode.Announce
    && Boolean(delivery.to?.trim())
    && (delivery.channel === WeixinPlugin.Id
      || delivery.channel === PlatformRegistry.platformOfChannel(WeixinPlugin.Id));
}

export function hasResendableReport(run: ScheduledTaskRun): boolean {
  return run.status === TaskStatus.Success && Boolean(run.summary?.trim());
}
