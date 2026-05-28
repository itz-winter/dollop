import { BB } from '../../../bb/bb';
import klecksLogoImg from 'url:/src/app/img/klecks-logo.png';
import { LANG } from '../../../language/language';
import { css } from '../../../bb/base/base';

/**
 * Topmost row of the toolspace: logo + professional menu bar (File, Help).
 */
export class ToolspaceTopRow {
    private readonly rootEl: HTMLElement;
    private logoImEl: HTMLElement | null = null;

    // ----------------------------------- public -----------------------------------
    constructor(p: {
        logoImg: string;
        onLogo: () => void;
        onNew: () => void;
        onImport: () => void;
        onSave: () => void;
        onShare: () => void;
        onHelp: () => void;
    }) {
        this.rootEl = BB.el({
            className: 'kl-toolspace-row',
            css: {
                height: '36px',
                display: 'flex',
                alignItems: 'stretch',
            },
        });

        // --- Logo button ---
        const logoIm = BB.el({
            className: 'dark-invert',
            css: {
                backgroundImage: "url('" + (p.logoImg ? p.logoImg : klecksLogoImg) + "')",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                backgroundSize: 'contain',
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            },
        });
        this.logoImEl = logoIm;

        const logoBtn = BB.el({
            className: 'toolspace-row-button nohighlight kl-tool-row-border-right',
            title: LANG('home'),
            onClick: p.onLogo,
            css: { width: '44px', padding: '6px 0' },
        });
        logoBtn.append(logoIm);
        new BB.PointerListener({
            target: logoBtn,
            onEnterLeave: (isOver) => logoBtn.classList.toggle('toolspace-row-button-hover', isOver),
        });

        // --- Menu bar helper ---
        let activeDropdown: HTMLElement | null = null;
        let activeBtn: HTMLElement | null = null;

        function closeActiveDropdown() {
            if (activeDropdown) {
                activeDropdown.style.display = 'none';
                activeDropdown = null;
            }
            if (activeBtn) {
                activeBtn.classList.remove('kl-menu-bar-btn--open');
                activeBtn = null;
            }
        }

        document.addEventListener('mousedown', (e) => {
            if (activeDropdown && !activeDropdown.contains(e.target as Node) &&
                activeBtn && !activeBtn.contains(e.target as Node)) {
                closeActiveDropdown();
            }
        }, true);

        function createMenuBarBtn(label: string, items: {
            label: string;
            shortcut?: string;
            onClick?: () => void;
            separator?: boolean;
            hidden?: boolean;
        }[]): HTMLElement {
            const wrapper = BB.el({ css: { position: 'relative', display: 'flex', alignItems: 'stretch' } });

            const btn = BB.el({
                tagName: 'button',
                className: 'kl-menu-bar-btn',
                content: label,
            });

            const dropdown = BB.el({
                className: 'kl-menu-bar-dropdown',
                css: { display: 'none' },
            });

            items.forEach((item) => {
                if (item.hidden) return;
                if (item.separator) {
                    dropdown.append(BB.el({ className: 'kl-menu-bar-separator' }));
                    return;
                }
                const row = BB.el({
                    tagName: 'button',
                    className: 'kl-menu-bar-item',
                    onClick: () => {
                        closeActiveDropdown();
                        item.onClick && item.onClick();
                    },
                });
                row.append(BB.el({ content: item.label, css: { flex: '1' } }));
                if (item.shortcut) {
                    row.append(BB.el({ className: 'kl-menu-bar-shortcut', content: item.shortcut }));
                }
                dropdown.append(row);
            });

            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (activeDropdown === dropdown) {
                    closeActiveDropdown();
                    return;
                }
                closeActiveDropdown();
                activeDropdown = dropdown;
                activeBtn = btn;
                btn.classList.add('kl-menu-bar-btn--open');
                dropdown.style.display = 'block';
            });

            wrapper.append(btn, dropdown);
            return wrapper;
        }

        // --- File menu ---
        const fileItems = [
            { label: LANG('file-new'), shortcut: 'Ctrl+N', onClick: p.onNew },
            { label: LANG('file-import'), shortcut: 'Ctrl+O', onClick: p.onImport },
            { separator: true, label: '' },
            { label: LANG('file-save'), shortcut: 'Ctrl+S', onClick: p.onSave },
            ...(BB.canShareFiles() ? [
                { separator: true, label: '' },
                { label: LANG('file-share'), onClick: p.onShare },
            ] : []),
        ];
        const fileMenu = createMenuBarBtn(LANG('menu-file'), fileItems);

        // --- Help menu ---
        const helpMenu = createMenuBarBtn(LANG('help'), [
            { label: LANG('help'), onClick: p.onHelp },
        ]);
        css(helpMenu, { marginLeft: 'auto' });

        BB.append(this.rootEl, [logoBtn, fileMenu, helpMenu]);
    }

    setLogo(logoImg: string, isPixelated?: boolean, keepOriginalColors?: boolean): void {
        if (this.logoImEl) {
            this.logoImEl.style.backgroundImage = "url('" + logoImg + "')";
            this.logoImEl.style.imageRendering = isPixelated ? 'pixelated' : '';
            this.logoImEl.classList.toggle('dark-invert', !keepOriginalColors);
        }
    }

    getElement(): HTMLElement {
        return this.rootEl;
    }
}
