import { BB } from '../../../../bb/bb';
import { LANG } from '../../../../language/language';

export type TLayerContextMenuAction =
    | 'rename'
    | 'duplicate'
    | 'delete'
    | 'merge-down'
    | 'clear'
    | 'add-above'
    | 'add-below'
    | 'toggle-clip'
    | 'move-to-new-group'
    | 'remove-from-group';

export type TLayerContextMenuParams = {
    x: number;
    y: number;
    canDelete: boolean;
    canMergeDown: boolean;
    canAdd: boolean;
    isBackground: boolean;
    isClipped: boolean;
    canClip: boolean; // false when this is the bottom layer
    isFolder: boolean;       // true = this layer is a folder header
    isInFolder: boolean;     // true = this layer belongs to a folder
    canAddToFolder: boolean; // true = a folder exists to move into
    onAction: (action: TLayerContextMenuAction) => void;
};

let activeMenu: HTMLElement | null = null;

/**
 * Shows a custom right-click context menu for a layer.
 * Automatically removes itself when clicking outside or pressing Escape.
 */
export function showLayerContextMenu(p: TLayerContextMenuParams): void {
    // Dismiss any existing menu
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }

    const menuEl = BB.el({
        className: 'kl-layer-context-menu kl-popup-box',
        css: {
            position: 'fixed',
            zIndex: '10000',
            minWidth: '160px',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            padding: '4px 0',
            userSelect: 'none',
            fontSize: '13px',
        },
    });

    activeMenu = menuEl;

    type TMenuItem = {
        label: string;
        action: TLayerContextMenuAction;
        disabled?: boolean;
        isDivider?: false;
    };
    type TDivider = { isDivider: true };

    const items: (TMenuItem | TDivider)[] = [];

    if (!p.isBackground) {
        items.push({ label: LANG('layers-rename-title'), action: 'rename' });
    }
    items.push({ label: LANG('layers-duplicate'), action: 'duplicate', disabled: !p.canAdd });
    items.push({ isDivider: true });
    items.push({ label: LANG('layers-new') + ' Above', action: 'add-above', disabled: !p.canAdd });
    items.push({ label: LANG('layers-new') + ' Below', action: 'add-below', disabled: !p.canAdd });
    items.push({ isDivider: true });
    if (!p.isBackground) {
        items.push({ label: LANG('layers-merge'), action: 'merge-down', disabled: !p.canMergeDown });
    }
    items.push({ label: LANG('layers-clear'), action: 'clear' });
    if (!p.isBackground) {
        // Clip to layer below
        items.push({ isDivider: true });
        items.push({
            label: p.isClipped ? '✓ Clip to Layer Below' : 'Clip to Layer Below',
            action: 'toggle-clip',
            disabled: !p.canClip,
        });
        // Folder membership
        if (!p.isFolder) {
            items.push({ isDivider: true });
            if (p.isInFolder) {
                items.push({ label: 'Remove from Group', action: 'remove-from-group' });
            } else {
                items.push({
                    label: 'Move to New Group',
                    action: 'move-to-new-group',
                    disabled: !p.canAdd,
                });
            }
        }
        items.push({ isDivider: true });
        items.push({ label: LANG('layers-remove'), action: 'delete', disabled: !p.canDelete });
    }

    items.forEach((item) => {
        if ('isDivider' in item && item.isDivider) {
            const divider = BB.el({
                css: {
                    height: '1px',
                    margin: '4px 0',
                    background: 'currentColor',
                    opacity: '0.15',
                },
            });
            menuEl.append(divider);
            return;
        }
        const menuItem = item as TMenuItem;
        const btn = BB.el({
            tagName: 'button',
            content: menuItem.label,
            css: {
                display: 'block',
                width: '100%',
                padding: '6px 16px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: menuItem.disabled ? 'default' : 'pointer',
                color: menuItem.disabled ? 'var(--kl-text-muted, #999)' : 'inherit',
                fontSize: '13px',
                lineHeight: '1.4',
            },
        });
        (btn as HTMLButtonElement).disabled = !!menuItem.disabled;

        btn.onpointerenter = () => {
            if (!menuItem.disabled) {
                (btn as HTMLButtonElement).style.background = 'rgba(128,128,128,0.25)';
            }
        };
        btn.onpointerleave = () => {
            (btn as HTMLButtonElement).style.background = 'none';
        };

        btn.onclick = (e) => {
            e.stopPropagation();
            if (menuItem.disabled) return;
            close();
            p.onAction(menuItem.action);
        };

        menuEl.append(btn);
    });

    // Position the menu
    document.body.append(menuEl);

    // Adjust position to keep within viewport
    const rect = menuEl.getBoundingClientRect();
    let left = p.x;
    let top = p.y;
    if (left + rect.width > window.innerWidth) {
        left = window.innerWidth - rect.width - 4;
    }
    if (top + rect.height > window.innerHeight) {
        top = window.innerHeight - rect.height - 4;
    }
    menuEl.style.left = Math.max(0, left) + 'px';
    menuEl.style.top = Math.max(0, top) + 'px';

    const close = () => {
        if (menuEl.parentNode) {
            menuEl.remove();
        }
        if (activeMenu === menuEl) {
            activeMenu = null;
        }
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('contextmenu', onContextMenu, true);
    };

    const onDocPointerDown = (e: PointerEvent) => {
        if (!menuEl.contains(e.target as Node)) {
            close();
        }
    };
    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            close();
        }
    };
    const onContextMenu = (e: Event) => {
        if (!menuEl.contains(e.target as Node)) {
            e.preventDefault();
            close();
        }
    };

    // Slight delay to avoid immediately closing from the right-click that opened it
    setTimeout(() => {
        document.addEventListener('pointerdown', onDocPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('contextmenu', onContextMenu, true);
    }, 50);
}
