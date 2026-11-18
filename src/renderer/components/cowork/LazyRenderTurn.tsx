import React, { useEffect, useRef, useState } from 'react';

import { ConversationScrollAnchorAttribute } from './conversationScrollAnchor';

/**
 * LazyRenderTurn — Viewport-based lazy rendering wrapper for conversation turns.
 *
 * Renders a lightweight placeholder when the turn is far from the viewport,
 * and renders the actual content when it enters (or is near) the viewport.
 * Once rendered, keeps a cached height so the placeholder matches the real size.
 *
 * This dramatically reduces DOM node count and React reconciliation work
 * for long conversations (200+ turns).
 */

interface LazyRenderTurnProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Unique key for height cache */
  turnId: string;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  lastMessageId?: string;
  /** Vertical margin around viewport to pre-render (px) */
  rootMargin?: number;
  /** Whether this turn should always be rendered (e.g. last turn during streaming) */
  alwaysRender?: boolean;
  /** Optional dependency object (e.g. turn) to trigger re-render on change */
  dependency?: any;
  children: React.ReactNode;
}

// Global height cache survives re-renders — keyed by turnId
const heightCache = new Map<string, number>();

const LazyRenderTurn: React.FC<LazyRenderTurnProps> = ({
  turnId,
  scrollContainerRef,
  lastMessageId,
  rootMargin = 600,
  alwaysRender = false,
  dependency: _dependency,
  children,
  style,
  ...restProps
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(alwaysRender);

  // Observe intersection
  useEffect(() => {
    if (alwaysRender) {
      setIsVisible(true);
      return;
    }

    const el = containerRef.current;
    const root = scrollContainerRef.current;
    if (!el || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowVisible = entry.isIntersecting;
        if (!nowVisible) {
          const height = el.getBoundingClientRect().height;
          if (height > 0) heightCache.set(turnId, height);
        }
        setIsVisible(nowVisible);
      },
      {
        root,
        rootMargin: `${rootMargin}px 0px ${rootMargin}px 0px`,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [alwaysRender, rootMargin, scrollContainerRef, turnId]);

  // Cache height when visible content is rendered
  useEffect(() => {
    if (!isVisible) return;
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      if (h > 0) {
        heightCache.set(turnId, h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isVisible, turnId]);

  const shouldRender = isVisible || alwaysRender;
  const cachedHeight = heightCache.get(turnId);

  return (
    <div
      ref={containerRef}
      {...restProps}
      {...{ [ConversationScrollAnchorAttribute.Turn]: shouldRender ? lastMessageId : undefined }}
      style={{
        ...style,
        // Unmeasured placeholders must not replace a real message as Chromium's
        // reading anchor when a fast upward gesture crosses the render buffer.
        overflowAnchor: shouldRender ? style?.overflowAnchor : 'none',
        ...(!shouldRender && cachedHeight
          ? { height: cachedHeight, minHeight: cachedHeight }
          : undefined),
      }}
    >
      {shouldRender ? children : (
        <div
          style={{ height: cachedHeight || 80 }}
          className="bg-background"
        />
      )}
    </div>
  );
};

const MemoizedLazyRenderTurn = React.memo(LazyRenderTurn, (prevProps, nextProps) => {
  // 1. 如果 alwaysRender 属性改变，必须重新渲染
  if (prevProps.alwaysRender !== nextProps.alwaysRender) return false;
  // 2. 如果 alwaysRender 为真（表示是活跃消息、正流式输出或最新的前几项），必须重新渲染以展现最新状态
  if (prevProps.alwaysRender || nextProps.alwaysRender) return false;
  // 3. 如果 turnId 改变了，必须重新渲染
  if (prevProps.turnId !== nextProps.turnId) return false;
  // 4. 如果 dependency 改变了（例如历史消息数据发生变更，比如重新编辑保存），必须重新渲染
  if (prevProps.dependency !== nextProps.dependency) return false;
  // 5. 其余情况下，内容完全静态且不活跃，安全跳过重复渲染
  return true;
});

export default MemoizedLazyRenderTurn;

/** Clear all cached heights (e.g. when switching sessions) */
export const clearHeightCache = () => heightCache.clear();
