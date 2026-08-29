import { ChevronRightIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { i18nService } from '../../services/i18n';
import EllipsisHorizontalIcon from '../icons/EllipsisHorizontalIcon';
import { MANAGEMENT_BODY_TEXT } from './managementTypography';

const MENU_WIDTH_PX = 152;
const MENU_EDGE_GAP_PX = 8;
const MENU_TRIGGER_GAP_PX = 4;
const MENU_ITEM_HEIGHT_PX = 36;
const SUBMENU_MAX_VISIBLE_ITEMS = 4;

export const CARD_OVERFLOW_MENU_SURFACE_CLASSNAME =
  'rounded-xl border border-border bg-surface py-1 shadow-popover';
export const CARD_OVERFLOW_MENU_ITEM_CLASSNAME =
  `flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left ${MANAGEMENT_BODY_TEXT} transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/[0.05]`;
export const CARD_OVERFLOW_MENU_SUBMENU_CLASSNAME =
  'mx-2 mb-1 overflow-y-auto pl-2';
export const CARD_OVERFLOW_MENU_SUBITEM_CLASSNAME =
  `flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-md px-2 text-left ${MANAGEMENT_BODY_TEXT} transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/[0.05]`;
export const CARD_OVERFLOW_MENU_SUBMENU_MAX_HEIGHT_PX =
  SUBMENU_MAX_VISIBLE_ITEMS * MENU_ITEM_HEIGHT_PX;

export interface CardOverflowMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  trailing?: React.ReactNode;
  children?: CardOverflowMenuItem[];
  onSelect?: () => void;
}

interface CardOverflowMenuProps {
  items: CardOverflowMenuItem[];
  /** Extra classes for the trigger, e.g. to reveal it on card hover. */
  className?: string;
  menuWidthPx?: number;
  onOpen?: () => void;
}

interface MenuPosition {
  top: number;
  left: number;
}

/**
 * Overflow menu for the low-frequency card actions (edit, delete), keeping
 * the card's own surface free for the enable switch — the one action people
 * actually reach for after installing something.
 */
const CardOverflowMenu: React.FC<CardOverflowMenuProps> = ({
  items,
  className = '',
  menuWidthPx = MENU_WIDTH_PX,
  onOpen,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [expandedItemKey, setExpandedItemKey] = useState<string | undefined>(undefined);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.right - menuWidthPx;
    if (left < MENU_EDGE_GAP_PX) {
      left = Math.max(MENU_EDGE_GAP_PX, rect.left);
    }
    if (left + menuWidthPx > viewportWidth - MENU_EDGE_GAP_PX) {
      left = Math.max(MENU_EDGE_GAP_PX, viewportWidth - MENU_EDGE_GAP_PX - menuWidthPx);
    }

    const estimatedHeight = items.length * MENU_ITEM_HEIGHT_PX + 8;
    let top = rect.bottom + MENU_TRIGGER_GAP_PX;
    if (top + estimatedHeight > viewportHeight - MENU_EDGE_GAP_PX && rect.top - estimatedHeight > MENU_EDGE_GAP_PX) {
      top = rect.top - estimatedHeight - MENU_TRIGGER_GAP_PX;
    }

    setPosition({ top, left });
  }, [items.length, menuWidthPx]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (expandedItemKey) {
          event.stopPropagation();
          setExpandedItemKey(undefined);
          return;
        }
        setIsOpen(false);
      }
    };
    const handleReflow = () => setIsOpen(false);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReflow);
    window.addEventListener('scroll', handleReflow, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReflow);
      window.removeEventListener('scroll', handleReflow, true);
    };
  }, [expandedItemKey, isOpen]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={i18nService.t('moreActions')}
        title={i18nService.t('moreActions')}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(value => {
            if (!value) onOpen?.();
            return !value;
          });
        }}
        className={`inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-raised hover:text-foreground ${
          isOpen ? 'bg-surface-raised text-foreground' : ''
        } ${className}`}
      >
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </button>
      {isOpen && position && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={(event) => event.stopPropagation()}
          style={{ top: position.top, left: position.left, width: menuWidthPx }}
          className={`fixed z-[9999] ${CARD_OVERFLOW_MENU_SURFACE_CLASSNAME}`}
        >
          {items.map(item => {
            const hasChildren = Boolean(item.children);
            const isExpanded = hasChildren && expandedItemKey === item.key;
            return (
              <div
                key={item.key}
                className={item.separatorBefore ? 'mt-1 border-t border-border pt-1' : ''}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup={hasChildren ? 'menu' : undefined}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  disabled={item.disabled}
                  onKeyDown={(event) => {
                    if (!hasChildren || item.disabled) return;
                    if (event.key === 'ArrowRight') {
                      event.preventDefault();
                      setExpandedItemKey(item.key);
                    } else if (event.key === 'ArrowLeft') {
                      event.preventDefault();
                      setExpandedItemKey(undefined);
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (item.disabled) return;
                    if (hasChildren) {
                      setExpandedItemKey(current => current === item.key ? undefined : item.key);
                      return;
                    }
                    setIsOpen(false);
                    item.onSelect?.();
                  }}
                  className={`${CARD_OVERFLOW_MENU_ITEM_CLASSNAME} ${
                    item.destructive ? 'text-red-500 dark:text-red-400' : 'text-foreground'
                  }`}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.trailing}
                  {hasChildren && (
                    <ChevronRightIcon
                      className={`h-3.5 w-3.5 shrink-0 text-tertiary transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  )}
                </button>
                {isExpanded && item.children && (
                  <div
                    role="group"
                    aria-label={item.label}
                    style={{ maxHeight: CARD_OVERFLOW_MENU_SUBMENU_MAX_HEIGHT_PX }}
                    className={CARD_OVERFLOW_MENU_SUBMENU_CLASSNAME}
                  >
                    {item.children.map(child => (
                      <button
                        key={child.key}
                        type="button"
                        role="menuitem"
                        disabled={child.disabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (child.disabled) return;
                          setIsOpen(false);
                          child.onSelect?.();
                        }}
                        className={`${CARD_OVERFLOW_MENU_SUBITEM_CLASSNAME} ${
                          child.destructive ? 'text-red-500 dark:text-red-400' : 'text-foreground'
                        }`}
                      >
                        {child.icon}
                        <span className="min-w-0 flex-1 truncate">{child.label}</span>
                        {child.trailing}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
};

export default CardOverflowMenu;
