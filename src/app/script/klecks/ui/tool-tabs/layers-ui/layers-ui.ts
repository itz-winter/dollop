import { BB } from '../../../../bb/bb';
import { Select } from '../../components/select';
import { PointSlider } from '../../components/point-slider';
import { KlCanvas, MAX_LAYERS } from '../../../canvas/kl-canvas';
import { TMixMode, TUiLayout } from '../../../kl-types';
import { LANG } from '../../../../language/language';
import { translateBlending } from '../../../canvas/translate-blending';
import { PointerListener } from '../../../../bb/input/pointer-listener';
import { TPointerEvent } from '../../../../bb/input/event.types';
import { renameLayerDialog } from './rename-layer-dialog';
import { mergeLayerDialog } from './merge-layer-dialog';
import { css, throwIfNull } from '../../../../bb/base/base';
import { HAS_POINTER_EVENTS } from '../../../../bb/base/browser';
import { c } from '../../../../bb/base/c';
import { DropdownMenu } from '../../components/dropdown-menu';
import addLayerImg from 'url:/src/app/img/ui/add-layer.svg';
import duplicateLayerImg from 'url:/src/app/img/ui/duplicate-layer.svg';
import mergeLayerImg from 'url:/src/app/img/ui/merge-layers.svg';
import removeLayerImg from 'url:/src/app/img/ui/remove-layer.svg';
import renameLayerImg from 'url:/src/app/img/ui/rename-layer.svg';
import clipToBelowImg from 'url:/src/app/img/ui/clip-to-below.svg';
import caretDownImg from 'url:/src/app/img/ui/caret-down.svg';
import addFolderImg from 'url:/src/app/img/ui/add-folder.svg';
import { KlHistory } from '../../../history/kl-history';
import { makeUnfocusable } from '../../../../bb/base/ui';
import { showLayerContextMenu } from './layer-context-menu';
import { showModal } from '../../modals/base/showModal';

const paddingLeft = 25;

type TLayerEl = HTMLElement & {
    label: HTMLElement;
    opacityLabel: HTMLElement;
    thumb: HTMLCanvasElement;

    spot: number;
    posY: number;
    layerName: string;
    opacity: number;
    pointerListener: PointerListener;
    opacitySlider: PointSlider;
    isSelected: boolean;
    isBackground: boolean;
};

export type TLayersUiParams = {
    klCanvas: KlCanvas;
    onSelect: (layerIndex: number, pushHistory: boolean) => void;
    parentEl: HTMLElement;
    uiState: TUiLayout;
    applyUncommitted: () => void;
    klHistory: KlHistory;
    onUpdateProject: () => void; // triggers update of easel
    onClearLayer: () => void;
    onChangeBackgroundColor?: (layerIndex: number, color: { r: number; g: number; b: number }) => void;
};

export class LayersUi {
    // from params
    private klCanvas: KlCanvas;
    private readonly onSelect: (layerIndex: number, pushHistory: boolean) => void;
    private readonly parentEl: HTMLElement;
    private uiState: TUiLayout;
    private readonly applyUncommitted: () => void;
    private klHistory: KlHistory;
    private readonly onUpdateProject: () => void;
    private readonly onClearLayer: () => void;
    private readonly onChangeBackgroundColor?: (layerIndex: number, color: { r: number; g: number; b: number }) => void;

    private readonly rootEl: HTMLElement;
    private isVisible: boolean = true;
    private klCanvasLayerArr: {
        context: CanvasRenderingContext2D;
        opacity: number;
        name: string;
        mixModeStr: TMixMode;
        isBackground?: boolean;
        isFolder?: boolean;
    }[];
    private readonly layerListEl: HTMLElement;
    private layerElArr: TLayerEl[];
    private selectedSpotIndex: number;
    private readonly removeBtn: HTMLButtonElement;
    private readonly addBtn: HTMLButtonElement;
    private readonly duplicateBtn: HTMLButtonElement;
    private readonly mergeBtn: HTMLButtonElement;
    private readonly clipBtn: HTMLButtonElement;
    // addGroupBtn removed - create folders by dragging a layer onto another
    private readonly moreDropdown: DropdownMenu<'clear-layer' | 'advanced-merge' | 'merge-all' | 'create-folder'>;
    private readonly modeSelect: Select<TMixMode>;
    private readonly largeThumbDiv: HTMLElement;
    private oldHistoryState: number | undefined;
    private multiSelectedSpots: Set<number> = new Set(); // spots included in a shift-click range (besides primaryspot)
    private isManipulating: boolean = false;

    private readonly largeThumbCanvas: HTMLCanvasElement;
    private largeThumbInDocument: boolean;
    private largeThumbInTimeout: undefined | ReturnType<typeof setTimeout>;
    private largeThumbTimeout: undefined | ReturnType<typeof setTimeout>;
    private lastpos: number = 0;

    private readonly layerHeight: number = 35;
    private readonly layerSpacing: number = 0;

    private move(oldSpotIndex: number, newSpotIndex: number): void {
        if (isNaN(oldSpotIndex) || isNaN(newSpotIndex)) {
            throw 'layers-ui - invalid move';
        }
        for (let i = 0; i < this.layerElArr.length; i++) {
            ((i) => {
                let posy = this.layerElArr[i].spot;
                if (this.layerElArr[i].spot === oldSpotIndex) {
                    posy = newSpotIndex;
                } else {
                    if (this.layerElArr[i].spot > oldSpotIndex) {
                        posy--;
                    }
                    if (posy >= newSpotIndex) {
                        posy++;
                    }
                }
                this.layerElArr[i].spot = posy;
                this.layerElArr[i].posY =
                    (this.layerHeight + this.layerSpacing) *
                    (this.klCanvasLayerArr.length - posy - 1);
                this.layerElArr[i].style.top = this.layerElArr[i].posY + 'px';
            })(i);
        }
        if (oldSpotIndex === newSpotIndex) {
            return;
        }
        this.applyUncommitted();
        this.klCanvas.moveLayer(this.selectedSpotIndex, newSpotIndex - oldSpotIndex);
        this.klCanvasLayerArr = this.klCanvas.getLayers();
        this.selectedSpotIndex = newSpotIndex;
        this.mergeBtn.disabled = this.selectedSpotIndex === 0;
    }

    private posToSpot(p: number): number {
        let result = parseInt('' + (p / (this.layerHeight + this.layerSpacing) + 0.5));
        result = Math.min(this.klCanvasLayerArr.length - 1, Math.max(0, result));
        result = this.klCanvasLayerArr.length - result - 1;
        return result;
    }

    /**
     * update css position of all layers that are not being dragged, while dragging
     */
    private updateLayersVerticalPosition(elementIndex: number, newspot: number): void {
        newspot = Math.min(this.klCanvasLayerArr.length - 1, Math.max(0, newspot));
        if (newspot === this.lastpos) {
            return;
        }
        for (let i = 0; i < this.layerElArr.length; i++) {
            if (this.layerElArr[i].spot === elementIndex) {
                continue;
            }
            let posy = this.layerElArr[i].spot;
            if (this.layerElArr[i].spot > elementIndex) {
                posy--;
            }
            if (posy >= newspot) {
                posy++;
            }
            this.layerElArr[i].posY =
                (this.layerHeight + this.layerSpacing) * (this.klCanvasLayerArr.length - posy - 1);
            this.layerElArr[i].style.top = this.layerElArr[i].posY + 'px';
        }
        this.lastpos = newspot;
    }

    private renameLayer(layerSpot: number): void {
        renameLayerDialog(this.parentEl, this.klCanvas.getLayerOld(layerSpot)!.name, (newName) => {
            if (newName === undefined || newName === this.klCanvas.getLayerOld(layerSpot)!.name) {
                return;
            }
            this.klCanvas.renameLayer(layerSpot, newName);
            //this.createLayerList();
            this.onSelect(layerSpot, false);
        });
    }

    private _openBackgroundColorPicker(layerIndex: number): void {
        const currentLayer = this.klCanvas.getLayer(layerIndex);
        const currentColor = currentLayer.backgroundColor ?? { r: 255, g: 255, b: 255 };
        const toHex2 = (n: number) => n.toString(16).padStart(2, '0');
        const colorStr = `#${toHex2(currentColor.r)}${toHex2(currentColor.g)}${toHex2(currentColor.b)}`;

        const colorInput = BB.el({
            tagName: 'input',
            custom: { type: 'color', value: colorStr },
            css: { display: 'block', width: '100%', height: '40px', cursor: 'pointer', border: 'none' },
        }) as HTMLInputElement;

        const wrapper = BB.el({ css: { padding: '10px' } });
        wrapper.append(
            BB.el({ content: 'Background Color:', css: { marginBottom: '8px', fontSize: '14px' } }),
            colorInput,
        );

        showModal({
            div: wrapper,
            message: '',
            buttons: ['Ok', 'Cancel'],
            callback: (result: string) => {
                if (result !== 'Ok') return;
                const hex = colorInput.value;
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                const newColor = { r, g, b };
                this.klCanvas.setBackgroundColor(layerIndex, newColor);
                if (this.onChangeBackgroundColor) {
                    this.onChangeBackgroundColor(layerIndex, newColor);
                }
                this.onSelect(layerIndex, false);
            },
        });
    }

    private updateHeight(): void {
        this.layerListEl.style.height = this.layerElArr.length * 35 + 'px';
    }

    /**
     * Compute a display rank for each spot index so that within a folder group
     * the folder always appears at the top (highest rank = visually highest).
     * Returns an array where result[spot] = displayRank.
     */
    private computeDisplayRanks(): number[] {
        const n = this.klCanvasLayerArr.length;
        const ranks = Array.from({ length: n }, (_, i) => i);
        // For each folder, collect its group and ensure folder gets the max rank in the group
        for (let fi = 0; fi < n; fi++) {
            const fl = this.klCanvas.getLayer(fi);
            if (!fl.isFolder || !fl.id) continue;
            const folderId = fl.id;
            const childSpots: number[] = [];
            for (let ci = 0; ci < n; ci++) {
                if (ci !== fi && this.klCanvas.getLayer(ci).folderId === folderId) {
                    childSpots.push(ci);
                }
            }
            if (childSpots.length === 0) continue;
            const groupSpots = [fi, ...childSpots].sort((a, b) => a - b);
            const groupRanks = groupSpots.map((s) => ranks[s]).sort((a, b) => a - b);
            // Folder gets the highest rank; children get the lower ranks in ascending order
            ranks[fi] = groupRanks[groupRanks.length - 1];
            childSpots.sort((a, b) => a - b).forEach((cs, idx) => {
                ranks[cs] = groupRanks[idx];
            });
        }
        return ranks;
    }

    private createLayerList(force?: boolean): void {
        if (this.klHistory.getChangeCount() === this.oldHistoryState && !force) {
            return;
        }
        this.isManipulating = false;
        this.oldHistoryState = this.klHistory.getChangeCount();
        this.klCanvasLayerArr = this.klCanvas.getLayers();
        const displayRanks = this.computeDisplayRanks();

        const createLayerEntry = (index: number): void => {
            const klLayer = throwIfNull(this.klCanvas.getLayerOld(index));
            const klCanvasLayer = this.klCanvas.getLayer(index);
            const layerName = klLayer.name;
            const opacity = this.klCanvasLayerArr[index].opacity;
            const isVisible = klLayer.isVisible;
            const layercanvas = this.klCanvasLayerArr[index].context.canvas;
            const isBackground = !!klCanvasLayer.isBackground;
            const isFolder = !!klCanvasLayer.isFolder;
            const isFolderOpen = klCanvasLayer.isFolderOpen !== false;
            const isInFolder = !!klCanvasLayer.folderId;

            const layer: TLayerEl = BB.el({
                className: 'kl-layer',
            }) as HTMLElement as TLayerEl;
            this.layerElArr[index] = layer;
            layer.posY = (this.klCanvasLayerArr.length - 1 - displayRanks[index]) * (this.layerHeight + this.layerSpacing);
            css(layer, { top: layer.posY + 'px' });
            layer.isBackground = isBackground;
            layer.spot = index;

            // ── Shared handlers (defined before both branches so folder can use them) ──

            const shiftClickHandler = (e: PointerEvent) => {
                if (e.button !== 0 || !e.shiftKey || this.isManipulating) return;
                e.stopPropagation();
                const clickedSpot = layer.spot;
                const anchor = this.selectedSpotIndex;
                const lo = Math.min(anchor, clickedSpot);
                const hi = Math.max(anchor, clickedSpot);
                this.multiSelectedSpots.clear();
                for (let s = lo; s <= hi; s++) {
                    if (s !== anchor) this.multiSelectedSpots.add(s);
                }
                this.refreshMultiSelectHighlight();
            };

            let dragstart = false;
            let freshSelection = false;
            let isDragging = false;
            let folderChildData: { el: TLayerEl; relOffset: number }[] = [];

            const dragEventHandler = (event: TPointerEvent) => {
                if (event.type === 'pointerdown' && event.button === 'left' && !this.isManipulating) {
                    if (layer.isBackground) {
                        if (!layer.isSelected) {
                            this.multiSelectedSpots.clear();
                            this.activateLayer(layer.spot);
                        }
                        return;
                    }
                    css(layer, { transition: 'box-shadow 0.3s ease-in-out', zIndex: '1' });
                    this.lastpos = layer.spot;
                    freshSelection = false;
                    if (!layer.isSelected) {
                        freshSelection = true;
                        this.multiSelectedSpots.clear();
                        this.activateLayer(layer.spot);
                    }
                    folderChildData = [];
                    if (isFolder) {
                        const folderId = klCanvasLayer.id;
                        for (const el of this.layerElArr) {
                            if (el === layer) continue;
                            const elLayerInfo = this.klCanvas.getLayer(el.spot);
                            if (elLayerInfo.folderId === folderId) {
                                folderChildData.push({ el, relOffset: el.posY - layer.posY });
                                css(el, { zIndex: '1' });
                            }
                        }
                    }
                    dragstart = true;
                    isDragging = true;
                    this.isManipulating = true;
                } else if (event.type === 'pointermove' && event.button === 'left' && isDragging) {
                    if (dragstart) {
                        dragstart = false;
                        css(layer, { boxShadow: '1px 3px 5px rgba(0,0,0,0.4)' });
                        for (const { el } of folderChildData) {
                            css(el, { boxShadow: '1px 3px 5px rgba(0,0,0,0.25)' });
                        }
                    }
                    const hasBgAtBottom = !!this.klCanvasLayerArr[0]?.isBackground;
                    const minSpot = hasBgAtBottom ? 1 : 0;
                    const maxPosY = (this.klCanvasLayerArr.length - 1 - minSpot) * (this.layerHeight + this.layerSpacing);
                    layer.posY += event.dY;
                    const corrected = Math.max(0, Math.min(maxPosY, layer.posY));
                    layer.style.top = corrected + 'px';
                    for (const { el, relOffset } of folderChildData) {
                        el.style.top = corrected + relOffset + 'px';
                    }
                    if (folderChildData.length === 0) {
                        this.updateLayersVerticalPosition(layer.spot, this.posToSpot(layer.posY));
                    }
                }
                if (event.type === 'pointerup' && isDragging) {
                    this.isManipulating = false;
                    css(layer, { transition: 'all 0.1s linear' });
                    setTimeout(() => {
                        css(layer, { boxShadow: '' });
                        for (const { el } of folderChildData) {
                            css(el, { boxShadow: '', zIndex: '' });
                        }
                    }, 20);
                    const hasBgAtBottom = !!this.klCanvasLayerArr[0]?.isBackground;
                    const minSpot = hasBgAtBottom ? 1 : 0;
                    const maxPosY = (this.klCanvasLayerArr.length - 1 - minSpot) * (this.layerHeight + this.layerSpacing);
                    layer.posY = Math.max(0, Math.min(maxPosY, layer.posY));
                    layer.style.zIndex = '';
                    for (const { el } of folderChildData) { el.style.zIndex = ''; }
                    const newSpot = this.posToSpot(layer.posY);
                    const oldSpot = layer.spot;
                    isDragging = false;
                    if (isFolder && folderChildData.length > 0) {
                        this.applyUncommitted();
                        const delta = newSpot - oldSpot;
                        const newFolderSpot = this.klCanvas.moveLayerGroup(oldSpot, delta);
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.selectedSpotIndex = typeof newFolderSpot === 'number' ? newFolderSpot : oldSpot;
                        this.onSelect(this.selectedSpotIndex, false);
                        this.updateButtons();
                        folderChildData = [];
                        return;
                    }
                    const targetLayerInfo = newSpot !== oldSpot ? this.klCanvas.getLayer(newSpot) : null;
                    if (targetLayerInfo && targetLayerInfo.isFolder && targetLayerInfo.id) {
                        this.applyUncommitted();
                        this.klCanvas.setLayerFolder(oldSpot, targetLayerInfo.id);
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.onSelect(oldSpot, false);
                        for (let k = 0; k < this.layerElArr.length; k++) {
                            const el = this.layerElArr[k];
                            el.posY = (this.klCanvasLayerArr.length - 1 - el.spot) * this.layerHeight;
                            el.style.top = el.posY + 'px';
                        }
                    } else {
                        this.move(layer.spot, newSpot);
                        if (oldSpot !== newSpot) {
                            this.onSelect(this.selectedSpotIndex, false);
                        }
                        if (oldSpot === newSpot && freshSelection) {
                            this.applyUncommitted();
                            this.onSelect(this.selectedSpotIndex, true);
                        }
                    }
                    freshSelection = false;
                }
            };

            const layerContextMenuHandler = (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (!layer.isSelected) {
                    this.activateLayer(layer.spot);
                    this.applyUncommitted();
                    this.onSelect(layer.spot, true);
                }
                const klLayerInfo = this.klCanvas.getLayer(layer.spot);
                const ctxIsBackground = !!klLayerInfo.isBackground;
                const ctxIsClipped = !!klLayerInfo.isClipped;
                const ctxIsFolder = !!klLayerInfo.isFolder;
                const ctxIsInFolder = !!klLayerInfo.folderId;
                const canAddToFolder = this.klCanvasLayerArr.some((l: any) => l.isFolder);
                showLayerContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    canDelete: this.layerElArr.length > 1 && !ctxIsBackground,
                    canMergeDown: layer.spot > 0,
                    canAdd: this.klCanvasLayerArr.length < MAX_LAYERS,
                    isBackground: ctxIsBackground,
                    isClipped: ctxIsClipped,
                    canClip: layer.spot > 0 && !ctxIsBackground,
                    isFolder: ctxIsFolder,
                    isInFolder: ctxIsInFolder,
                    canAddToFolder,
                    onAction: (action) => {
                        this.applyUncommitted();
                        if (action === 'rename') {
                            this.renameLayer(layer.spot);
                        } else if (action === 'duplicate') {
                            if (this.klCanvas.duplicateLayer(this.selectedSpotIndex) === false) return;
                            this.klCanvasLayerArr = this.klCanvas.getLayers();
                            this.selectedSpotIndex++;
                            this.onSelect(this.selectedSpotIndex, false);
                            this.updateButtons();
                        } else if (action === 'delete') {
                            if (this.layerElArr.length <= 1) return;
                            this.klCanvas.removeLayer(this.selectedSpotIndex);
                            if (this.selectedSpotIndex > 0) this.selectedSpotIndex--;
                            this.klCanvasLayerArr = this.klCanvas.getLayers();
                            this.onSelect(this.selectedSpotIndex, false);
                            this.updateButtons();
                        } else if (action === 'merge-down') {
                            if (this.selectedSpotIndex <= 0) return;
                            this.klCanvas.mergeLayers(this.selectedSpotIndex, this.selectedSpotIndex - 1);
                            this.klCanvasLayerArr = this.klCanvas.getLayers();
                            this.selectedSpotIndex--;
                            this.onSelect(this.selectedSpotIndex, false);
                            this.updateButtons();
                        } else if (action === 'clear') {
                            this.onClearLayer();
                        } else if (action === 'add-above') {
                            if (this.klCanvas.addLayer(this.selectedSpotIndex) === false) return;
                            this.klCanvasLayerArr = this.klCanvas.getLayers();
                            this.selectedSpotIndex = this.selectedSpotIndex + 1;
                            this.onSelect(this.selectedSpotIndex, false);
                            this.updateButtons();
                        } else if (action === 'add-below') {
                            const belowIndex = Math.max(0, this.selectedSpotIndex - 1);
                            if (this.klCanvas.addLayer(belowIndex) === false) return;
                            this.klCanvasLayerArr = this.klCanvas.getLayers();
                            this.onSelect(this.selectedSpotIndex, false);
                            this.updateButtons();
                        } else if (action === 'toggle-clip') {
                            this.klCanvas.setLayerClipped(layer.spot, !klLayerInfo.isClipped);
                            this.onSelect(layer.spot, false);
                        } else if (action === 'move-to-new-group') {
                            const folderIndex = this.klCanvas.addFolder(layer.spot + 1);
                            if (folderIndex !== false) {
                                this.klCanvasLayerArr = this.klCanvas.getLayers();
                                const folderLyr = this.klCanvas.getLayer(folderIndex);
                                if (folderLyr && folderLyr.id) {
                                    this.klCanvas.setLayerFolder(layer.spot, folderLyr.id);
                                }
                                this.klCanvasLayerArr = this.klCanvas.getLayers();
                                this.onSelect(layer.spot, false);
                                this.updateButtons();
                            }
                        } else if (action === 'remove-from-group') {
                            this.klCanvas.setLayerFolder(layer.spot, null);
                            this.onSelect(layer.spot, false);
                        }
                    },
                });
            };

            // ── FOLDER ROW ────────────────────────────────────────────────────────
            if (isFolder) {
                css(layer, { borderLeft: '3px solid #0af' });

                const preventDrag = (e: PointerEvent | MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                };

                const container1 = BB.el();
                css(container1, { width: '270px', height: '34px', position: 'relative' });
                const innerLayer = BB.el();
                css(innerLayer, { position: 'relative' });
                layer.append(innerLayer);
                innerLayer.append(container1);

                // Visibility checkbox
                {
                    const checkWrapper = BB.el({
                        tagName: 'label',
                        parent: container1,
                        title: LANG('layers-visibility-toggle'),
                        css: {
                            display: 'flex',
                            width: '25px',
                            height: '100%',
                            justifyContent: 'right',
                            alignItems: 'center',
                            cursor: 'pointer',
                        },
                    });
                    const check = BB.el({
                        tagName: 'input',
                        parent: checkWrapper,
                        custom: { type: 'checkbox', tabindex: '-1', name: 'layer-visibility' },
                        css: { display: 'block', cursor: 'pointer', margin: '0', marginRight: '5px' },
                    }) as HTMLInputElement;
                    check.checked = isVisible;
                    check.onchange = () => {
                        this.klCanvas.setLayerIsVisible(layer.spot, check.checked);
                        for (const spot of this.multiSelectedSpots) {
                            this.klCanvas.setLayerIsVisible(spot, check.checked);
                        }
                        this.onSelect(this.selectedSpotIndex, false);
                    };
                    if (HAS_POINTER_EVENTS) {
                        checkWrapper.onpointerdown = preventDrag;
                    } else {
                        checkWrapper.onmousedown = preventDrag;
                    }
                }

                // Chevron expand/collapse
                const chevron = BB.el({
                    content: isFolderOpen ? '▾' : '▸',
                    css: {
                        position: 'absolute',
                        left: '26px',
                        top: '0',
                        width: '22px',
                        height: '34px',
                        lineHeight: '34px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        fontSize: '14px',
                        userSelect: 'none',
                        zIndex: '2',
                    },
                });
                chevron.title = isFolderOpen ? 'Collapse folder' : 'Expand folder';
                chevron.onpointerdown = (e) => e.stopPropagation();
                chevron.onclick = (e) => {
                    e.stopPropagation();
                    this.klCanvas.setFolderOpen(index, !isFolderOpen);
                    this.onSelect(this.selectedSpotIndex, false);
                };
                container1.append(chevron);

                // Folder name label
                layer.label = BB.el({ className: 'kl-layer__label' });
                layer.layerName = layerName;
                layer.label.append(
                    Object.assign(document.createElement('img'), {
                        src: addFolderImg,
                        height: 13,
                        style: 'margin-right:5px;vertical-align:middle;opacity:0.8',
                    }),
                    layerName,
                );
                css(layer.label, {
                    position: 'absolute',
                    left: '50px',
                    top: '0',
                    height: '34px',
                    lineHeight: '34px',
                    fontSize: '13px',
                    fontWeight: '600',
                    width: '140px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                });
                layer.label.ondblclick = () => {
                    this.applyUncommitted();
                    this.renameLayer(layer.spot);
                };
                container1.append(layer.label);

                // Opacity % label - top-right
                layer.opacityLabel = BB.el({ className: 'kl-layer__opacity-label' });
                layer.opacity = opacity;
                layer.opacityLabel.append(Math.round(opacity * 100) + '%');
                css(layer.opacityLabel, {
                    position: 'absolute',
                    right: '0',
                    top: '0',
                    height: '17px',
                    lineHeight: '17px',
                    fontSize: '13px',
                    textAlign: 'right',
                    width: '50px',
                    transition: 'color 0.2s ease-in-out',
                    textDecoration: isVisible ? undefined : 'line-through',
                });
                container1.append(layer.opacityLabel);

                // Opacity slider - right-aligned, narrower
                let oldFolderOpacity: number;
                const folderOpacitySlider = new PointSlider({
                    init: layer.opacity,
                    width: 140,
                    pointSize: 14,
                    callback: (sliderValue, isFirst, isLast) => {
                        if (isFirst) {
                            this.isManipulating = true;
                            oldFolderOpacity = this.klCanvas.getLayerOld(layer.spot)!.opacity;
                            return;
                        }
                        if (isLast) {
                            this.isManipulating = false;
                            if (oldFolderOpacity !== sliderValue) {
                                this.klCanvas.setOpacity(layer.spot, sliderValue);
                            }
                            return;
                        }
                        layer.opacityLabel.innerHTML = Math.round(sliderValue * 100) + '%';
                        this.klHistory.pause(true);
                        try {
                            this.klCanvas.setOpacity(layer.spot, sliderValue);
                        } finally {
                            this.klHistory.pause(false);
                        }
                        this.onUpdateProject();
                    },
                    getDoIgnore: () => this.isManipulating,
                });
                css(folderOpacitySlider.getElement(), {
                    position: 'absolute',
                    right: '0',
                    top: '17px',
                });
                layer.opacitySlider = folderOpacitySlider;
                // stub thumb (needed by shared activation code)
                layer.thumb = BB.canvas(1, 1);
                container1.append(folderOpacitySlider.getElement());

                layer.pointerListener = new BB.PointerListener({
                    target: container1,
                    onPointer: dragEventHandler,
                    maxPointers: 1,
                });
                container1.oncontextmenu = layerContextMenuHandler;
                container1.addEventListener('pointerdown', shiftClickHandler, { capture: true });

                this.layerListEl.append(layer);
                return; // folder row complete
            }

            // ── NORMAL / BACKGROUND LAYER ROW ────────────────────────────────────
            if (isBackground) {
                layer.classList.add('kl-layer--background');
                css(layer, { background: 'linear-gradient(to right, rgba(200,180,120,0.12), transparent)' });
            }
            const innerLayer = BB.el();
            css(innerLayer, { position: 'relative' });

            const container1 = BB.el();
            css(container1, { width: '270px', height: '34px' });
            const container2 = BB.el();
            layer.append(innerLayer);
            innerLayer.append(container1, container2);

            //checkbox - visibility
            {
                const checkWrapper = BB.el({
                    tagName: 'label',
                    parent: container1,
                    title: LANG('layers-visibility-toggle'),
                    css: {
                        display: 'flex',
                        width: '25px',
                        height: '100%',
                        justifyContent: 'right',
                        alignItems: 'center',
                        cursor: 'pointer',
                    },
                });
                const check = BB.el({
                    tagName: 'input',
                    parent: checkWrapper,
                    custom: { type: 'checkbox', tabindex: '-1', name: 'layer-visibility' },
                    css: { display: 'block', cursor: 'pointer', margin: '0', marginRight: '5px' },
                }) as HTMLInputElement;
                check.checked = isVisible;
                check.onchange = () => {
                    this.klCanvas.setLayerIsVisible(layer.spot, check.checked);
                    for (const spot of this.multiSelectedSpots) {
                        this.klCanvas.setLayerIsVisible(spot, check.checked);
                    }
                    this.onSelect(this.selectedSpotIndex, false);
                };
                const preventFunc = (e: PointerEvent | MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                };
                if (HAS_POINTER_EVENTS) {
                    checkWrapper.onpointerdown = preventFunc;
                } else {
                    checkWrapper.onmousedown = preventFunc;
                }
            }

            //thumb
            {
                const thumbDimensions = BB.fitInto(layercanvas.width, layercanvas.height, 30, 30, 1);
                layer.thumb = BB.canvas(thumbDimensions.width, thumbDimensions.height);
                const thc = BB.ctx(layer.thumb);
                thc.save();
                if (layer.thumb.width > layercanvas.width) thc.imageSmoothingEnabled = false;
                thc.drawImage(layercanvas, 0, 0, layer.thumb.width, layer.thumb.height);
                thc.restore();
                css(layer.thumb, {
                    position: 'absolute',
                    left: (32 - layer.thumb.width) / 2 + paddingLeft + 'px',
                    top: (32 - layer.thumb.height) / 2 + 1 + 'px',
                    background: 'var(--kl-checkerboard-background)',
                });
            }

            if (klCanvasLayer.isClipped) {
                css(container1, { borderLeft: '5px solid #f33' });
            }
            if (isInFolder) {
                css(container1, { borderLeft: '4px solid rgba(0,170,255,0.5)' });
            }

            //layerlabel
            {
                layer.label = BB.el({ className: 'kl-layer__label' });
                layer.layerName = layerName;
                if (isBackground) {
                    layer.label.append('🔒 ');
                }
                layer.label.append(layer.layerName);
                css(layer.label, {
                    position: 'absolute',
                    left: 1 + 32 + 5 + paddingLeft + 'px',
                    top: 1 + 'px',
                    fontSize: '13px',
                    width: '165px',
                    height: '20px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                });
                layer.label.ondblclick = () => {
                    if (isBackground) {
                        this.applyUncommitted();
                        this._openBackgroundColorPicker(index);
                        return;
                    }
                    this.applyUncommitted();
                    this.renameLayer(layer.spot);
                };
            }

            //layer label opacity
            {
                layer.opacityLabel = BB.el({ className: 'kl-layer__opacity-label' });
                layer.opacity = opacity;
                layer.opacityLabel.append(parseInt('' + layer.opacity * 100) + '%');
                css(layer.opacityLabel, {
                    position: 'absolute',
                    left: 250 - 1 - 5 - 50 - 5 + paddingLeft + 'px',
                    top: 1 + 'px',
                    fontSize: '13px',
                    textAlign: 'right',
                    width: '50px',
                    transition: 'color 0.2s ease-in-out',
                    textDecoration: isVisible ? undefined : 'line-through',
                });
            }

            let oldOpacity: number;
            const opacitySlider = new PointSlider({
                init: layer.opacity,
                width: 200,
                pointSize: 14,
                callback: (sliderValue, isFirst, isLast) => {
                    if (isFirst) {
                        this.isManipulating = true;
                        oldOpacity = this.klCanvas.getLayerOld(layer.spot)!.opacity;
                        return;
                    }
                    if (isLast) {
                        this.isManipulating = false;
                        if (oldOpacity !== sliderValue) {
                            this.klCanvas.setOpacity(layer.spot, sliderValue);
                        }
                        return;
                    }
                    layer.opacityLabel.innerHTML = Math.round(sliderValue * 100) + '%';
                    this.klHistory.pause(true);
                    try {
                        this.klCanvas.setOpacity(layer.spot, sliderValue);
                    } finally {
                        this.klHistory.pause(false);
                    }
                    this.onUpdateProject();
                },
                getDoIgnore: () => this.isManipulating,
            });
            css(opacitySlider.getElement(), {
                position: 'absolute',
                left: 39 + paddingLeft + 'px',
                top: '17px',
            });
            layer.opacitySlider = opacitySlider;

            //larger layer preview - hover
            layer.thumb.onpointerover = (e) => {
                if (e.buttons !== 0 && (!e.pointerType || e.pointerType !== 'touch')) {
                    return;
                }
                const thumbDimensions = BB.fitInto(layercanvas.width, layercanvas.height, 250, 250, 1);
                if (
                    this.largeThumbCanvas.width !== thumbDimensions.width ||
                    this.largeThumbCanvas.height !== thumbDimensions.height
                ) {
                    this.largeThumbCanvas.width = thumbDimensions.width;
                    this.largeThumbCanvas.height = thumbDimensions.height;
                }
                const ctx = BB.ctx(this.largeThumbCanvas);
                ctx.save();
                if (this.largeThumbCanvas.width > layercanvas.width) ctx.imageSmoothingEnabled = false;
                ctx.imageSmoothingQuality = 'high';
                ctx.clearRect(0, 0, this.largeThumbCanvas.width, this.largeThumbCanvas.height);
                ctx.drawImage(layercanvas, 0, 0, this.largeThumbCanvas.width, this.largeThumbCanvas.height);
                ctx.restore();
                css(this.largeThumbDiv, {
                    top: e.clientY - this.largeThumbCanvas.height / 2 + 'px',
                    opacity: '0',
                });
                if (!this.largeThumbInDocument) {
                    document.body.append(this.largeThumbDiv);
                    this.largeThumbInDocument = true;
                }
                clearTimeout(this.largeThumbInTimeout);
                this.largeThumbInTimeout = setTimeout(() => {
                    css(this.largeThumbDiv, { opacity: '1' });
                }, 20);
                clearTimeout(this.largeThumbTimeout);
            };
            layer.thumb.onpointerout = () => {
                clearTimeout(this.largeThumbInTimeout);
                css(this.largeThumbDiv, { opacity: '0' });
                clearTimeout(this.largeThumbTimeout);
                this.largeThumbTimeout = setTimeout(() => {
                    if (!this.largeThumbInDocument) return;
                    this.largeThumbDiv.remove();
                    this.largeThumbInDocument = false;
                }, 300);
            };

            container1.append(
                layer.thumb,
                layer.label,
                layer.opacityLabel,
                opacitySlider.getElement(),
            );

            container1.addEventListener('pointerdown', shiftClickHandler, { capture: true });

            layer.pointerListener = new BB.PointerListener({
                target: container1,
                onPointer: dragEventHandler,
                maxPointers: 1,
            });

            container1.oncontextmenu = layerContextMenuHandler;

            this.layerListEl.append(layer);
        };
        this.layerElArr = [];
        while (this.layerListEl.firstChild) {
            const child = this.layerListEl.firstChild as TLayerEl;
            child.pointerListener.destroy();
            child.opacitySlider.destroy();
            child.remove();
        }
        for (let i = 0; i < this.klCanvasLayerArr.length; i++) {
            createLayerEntry(i);
        }
        this.activateLayer(this.selectedSpotIndex);
        this.updateHeight();
    }

    private updateButtons(): void {
        const maxReached = this.klCanvasLayerArr.length === MAX_LAYERS;
        const oneLayer = this.klCanvasLayerArr.length === 1;
        const selectedLayer = this.klCanvas.getLayer(this.selectedSpotIndex);
        const isBackground = !!(selectedLayer && (selectedLayer as any).isBackground);

        this.addBtn.disabled = maxReached;
        this.removeBtn.disabled = oneLayer || isBackground;
        this.duplicateBtn.disabled = maxReached;
        this.mergeBtn.disabled = this.selectedSpotIndex === 0;
        this.clipBtn.disabled = this.selectedSpotIndex === 0 || isBackground;
        this.moreDropdown.setEnabled('advanced-merge', !oneLayer);
        this.moreDropdown.setEnabled('merge-all', !oneLayer);
    }

    // ----------------------------------- public -----------------------------------
    constructor(p: TLayersUiParams) {
        this.klCanvas = p.klCanvas;
        this.onSelect = p.onSelect;
        this.parentEl = p.parentEl;
        this.uiState = p.uiState;
        this.applyUncommitted = p.applyUncommitted;
        this.klHistory = p.klHistory;
        this.onUpdateProject = p.onUpdateProject;
        this.onClearLayer = p.onClearLayer;
        this.onChangeBackgroundColor = p.onChangeBackgroundColor;

        this.layerElArr = [];
        this.layerHeight = 35;
        this.layerSpacing = 0;
        const width = 270;

        this.largeThumbDiv = BB.el({
            onClick: BB.handleClick,
            css: {
                position: 'absolute',
                top: '500px',
                boxShadow: '1px 1px 3px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                padding: '0',
                border: '1px solid #aaa',
                transition: 'opacity 0.3s ease-out',
                userSelect: 'none',
                background: 'var(--kl-checkerboard-background)',
            },
        });
        this.setUiState(this.uiState);
        this.largeThumbCanvas = BB.canvas(200, 200);
        this.largeThumbCanvas.style.display = 'block';
        this.largeThumbDiv.append(this.largeThumbCanvas);
        this.largeThumbInDocument = false;

        this.klCanvasLayerArr = this.klCanvas.getLayers();
        this.selectedSpotIndex = this.klCanvasLayerArr.length - 1;
        this.rootEl = BB.el({
            css: {
                marginRight: '10px',
                marginBottom: '10px',
                marginLeft: '10px',
                marginTop: '10px',
                cursor: 'default',
                position: 'relative',
                zIndex: '0',
            },
        });

        const listDiv = BB.el({
            css: {
                width: width + 'px',
                position: 'relative',
                margin: '0 -10px',
                zIndex: '0',
            },
        });

        this.layerListEl = BB.el({
            parent: listDiv,
        });

        // Right-click anywhere in the layer list (or blank space below) shows the selected layer's menu
        this.rootEl.oncontextmenu = (e: MouseEvent) => {
            e.preventDefault();
            const klLayerInfo = this.klCanvas.getLayer(this.selectedSpotIndex);
            const isBackground = !!klLayerInfo.isBackground;
            const isClipped = !!klLayerInfo.isClipped;
            const isFolder = !!klLayerInfo.isFolder;
            const isInFolder = !!klLayerInfo.folderId;
            const canAddToFolder = this.klCanvasLayerArr.some((l: any) => l.isFolder);
            showLayerContextMenu({
                x: e.clientX,
                y: e.clientY,
                canDelete: this.layerElArr.length > 1 && !isBackground,
                canMergeDown: this.selectedSpotIndex > 0,
                canAdd: this.klCanvasLayerArr.length < MAX_LAYERS,
                isBackground,
                isClipped,
                canClip: this.selectedSpotIndex > 0 && !isBackground,
                isFolder,
                isInFolder,
                canAddToFolder,
                onAction: (action) => {
                    // Delegate to the active layer row's handler by triggering the same logic
                    this.applyUncommitted();
                    const spot = this.selectedSpotIndex;
                    if (action === 'rename') {
                        this.renameLayer(spot);
                    } else if (action === 'duplicate') {
                        if (this.klCanvas.duplicateLayer(spot) === false) return;
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.selectedSpotIndex++;
                        this.onSelect(this.selectedSpotIndex, false);
                        this.updateButtons();
                    } else if (action === 'delete') {
                        if (this.layerElArr.length <= 1) return;
                        this.klCanvas.removeLayer(spot);
                        if (this.selectedSpotIndex > 0) this.selectedSpotIndex--;
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.onSelect(this.selectedSpotIndex, false);
                        this.updateButtons();
                    } else if (action === 'merge-down') {
                        if (spot <= 0) return;
                        this.klCanvas.mergeLayers(spot, spot - 1);
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.selectedSpotIndex--;
                        this.onSelect(this.selectedSpotIndex, false);
                        this.updateButtons();
                    } else if (action === 'clear') {
                        this.onClearLayer();
                    } else if (action === 'add-above') {
                        if (this.klCanvas.addLayer(spot) === false) return;
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.selectedSpotIndex = spot + 1;
                        this.onSelect(this.selectedSpotIndex, false);
                        this.updateButtons();
                    } else if (action === 'add-below') {
                        const belowIndex = Math.max(0, spot - 1);
                        if (this.klCanvas.addLayer(belowIndex) === false) return;
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.onSelect(this.selectedSpotIndex, false);
                        this.updateButtons();
                    } else if (action === 'toggle-clip') {
                        this.klCanvas.setLayerClipped(spot, !klLayerInfo.isClipped);
                        this.onSelect(spot, false);
                    } else if (action === 'move-to-new-group') {
                        const folderIndex = this.klCanvas.addFolder(spot);
                        if (folderIndex === false) return;
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        const layerNewSpot = spot + 1;
                        const folderLayer = this.klCanvas.getLayer(folderIndex);
                        if (folderLayer && folderLayer.id) {
                            this.klCanvas.setLayerFolder(layerNewSpot, folderLayer.id);
                        }
                        this.klCanvasLayerArr = this.klCanvas.getLayers();
                        this.selectedSpotIndex = layerNewSpot;
                        this.onSelect(this.selectedSpotIndex, false);
                        this.updateButtons();
                    } else if (action === 'remove-from-group') {
                        this.klCanvas.setLayerFolder(spot, null);
                        this.onSelect(spot, false);
                    }
                },
            });
        };

        this.addBtn = BB.el({ tagName: 'button' });
        this.duplicateBtn = BB.el({ tagName: 'button' });
        this.mergeBtn = BB.el({ tagName: 'button' });
        this.removeBtn = BB.el({ tagName: 'button' });
        this.clipBtn = BB.el({ tagName: 'button' });
        const renameBtn = BB.el({ tagName: 'button' });
        this.moreDropdown = new DropdownMenu({
            button: BB.el({
                content: `<img src="${caretDownImg}" width="13"/>`,
                css: {
                    display: 'flex',
                    justifyContent: 'center',
                    opacity: '0.9',
                },
            }),
            buttonTitle: LANG('more'),
            items: [
                ['clear-layer', LANG('layers-clear'), '⌫'],
                ['advanced-merge', LANG('layers-merge-advanced'), 'Ctrl + Shift + E'],
                ['merge-all', LANG('layers-merge-all')],
                ['create-folder', 'Create Folder'],
            ],
            onItemClick: (id) => {
                if (id === 'clear-layer') {
                    this.applyUncommitted();
                    this.onClearLayer();
                }
                if (id === 'advanced-merge') {
                    this.advancedMergeDialog();
                }
                if (id === 'merge-all') {
                    this.applyUncommitted();
                    const newIndex = this.klCanvas.mergeAll();
                    if (newIndex === false) {
                        return;
                    }
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    this.selectedSpotIndex = newIndex;
                    this.onSelect(this.selectedSpotIndex, false);
                    this.updateButtons();
                }
                if (id === 'create-folder') {
                    this.applyUncommitted();
                    // Collect all selected spots (primary + multi), sorted low→high
                    const allSpots = Array.from(
                        new Set([this.selectedSpotIndex, ...this.multiSelectedSpots]),
                    ).sort((a, b) => a - b);
                    // Insert folder ABOVE all selected layers (at highest spot + 1)
                    // so it always appears at the top of the group
                    const insertAt = allSpots[allSpots.length - 1] + 1;
                    const folderIndex = this.klCanvas.addFolder(insertAt);
                    if (folderIndex === false) return;
                    // Children are all at spots < folderIndex - no index shifting needed
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    const newFolderLayer = this.klCanvas.getLayer(folderIndex);
                    if (newFolderLayer && newFolderLayer.id) {
                        for (const spot of allSpots) {
                            this.klCanvas.setLayerFolder(spot, newFolderLayer.id);
                        }
                    }
                    this.multiSelectedSpots.clear();
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    this.selectedSpotIndex = folderIndex;
                    this.onSelect(this.selectedSpotIndex, false);
                    this.updateButtons();
                }
            },
        });

        this.updateButtons();

        const createButtons = () => {
            const div = BB.el();
            const async = () => {
                makeUnfocusable(this.addBtn);
                makeUnfocusable(this.duplicateBtn);
                makeUnfocusable(this.mergeBtn);
                makeUnfocusable(this.removeBtn);
                makeUnfocusable(renameBtn);
                makeUnfocusable(this.clipBtn);

                const commonStyle = {
                    cssFloat: 'left',
                    paddingLeft: '5px',
                    paddingRight: '3px',
                };
                css(this.addBtn, commonStyle);
                css(this.duplicateBtn, commonStyle);
                css(this.mergeBtn, commonStyle);
                css(this.removeBtn, commonStyle);
                css(renameBtn, {
                    cssFloat: 'left',
                    height: '30px',
                    lineHeight: '20px',
                });
                css(this.clipBtn, commonStyle);

                this.addBtn.title = LANG('layers-new');
                this.duplicateBtn.title = LANG('layers-duplicate');
                this.removeBtn.title = LANG('layers-remove');
                this.mergeBtn.title = LANG('layers-merge');
                renameBtn.title = LANG('layers-rename-title');
                this.clipBtn.title = 'Clip to Layer Below';

                this.addBtn.innerHTML = "<img src='" + addLayerImg + "' height='20'/>";
                this.duplicateBtn.innerHTML = "<img src='" + duplicateLayerImg + "' height='20'/>";
                this.mergeBtn.innerHTML = "<img src='" + mergeLayerImg + "' height='20'/>";
                this.removeBtn.innerHTML = "<img src='" + removeLayerImg + "' height='20'/>";
                renameBtn.innerHTML = "<img src='" + renameLayerImg + "' height='20'/>";
                this.clipBtn.innerHTML = "<img src='" + clipToBelowImg + "' height='20'/>";
                div.append(
                    c(',flex,gap-5,mb-10', [
                        this.addBtn,
                        this.removeBtn,
                        this.duplicateBtn,
                        this.mergeBtn,
                        renameBtn,
                        this.clipBtn,
                        c(',grow-1'),
                        this.moreDropdown.getElement(),
                    ]),
                );

                this.addBtn.onclick = () => {
                    this.applyUncommitted();
                    if (this.klCanvas.addLayer(this.selectedSpotIndex) === false) {
                        return;
                    }
                    this.klCanvasLayerArr = this.klCanvas.getLayers();

                    this.selectedSpotIndex = this.selectedSpotIndex + 1;
                    this.onSelect(this.selectedSpotIndex, false);

                    this.updateButtons();
                };
                this.duplicateBtn.onclick = () => {
                    this.applyUncommitted();
                    // Duplicate all selected spots, lowest first; track index shift
                    const allSpots = Array.from(new Set([this.selectedSpotIndex, ...this.multiSelectedSpots]))
                        .sort((a, b) => a - b);
                    let offset = 0;
                    let lastNewSpot = this.selectedSpotIndex + 1;
                    for (const spot of allSpots) {
                        const adjusted = spot + offset;
                        if (this.klCanvas.duplicateLayer(adjusted) === false) continue;
                        lastNewSpot = adjusted + 1;
                        offset++;
                    }
                    this.multiSelectedSpots.clear();
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    this.selectedSpotIndex = Math.min(lastNewSpot, this.klCanvasLayerArr.length - 1);
                    this.onSelect(this.selectedSpotIndex, false);
                    this.updateButtons();
                };
                this.removeBtn.onclick = () => {
                    this.applyUncommitted();
                    if (this.layerElArr.length <= 1) {
                        return;
                    }
                    // Collect all selected spots, skip background, delete highest first
                    const allSpots = Array.from(new Set([this.selectedSpotIndex, ...this.multiSelectedSpots]))
                        .filter(s => !this.klCanvasLayerArr[s]?.isBackground)
                        .sort((a, b) => b - a);
                    if (allSpots.length === 0) return;
                    for (const spot of allSpots) {
                        if (this.klCanvas.getLayers().length <= 1) break;
                        this.klCanvas.removeLayer(spot);
                    }
                    this.multiSelectedSpots.clear();
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    this.selectedSpotIndex = Math.max(0, Math.min(allSpots[allSpots.length - 1], this.klCanvasLayerArr.length - 1));
                    this.onSelect(this.selectedSpotIndex, false);
                    this.updateButtons();
                };
                this.mergeBtn.onclick = () => {
                    // fast merge
                    this.applyUncommitted();
                    if (this.selectedSpotIndex <= 0) {
                        return;
                    }
                    this.klCanvas.mergeLayers(this.selectedSpotIndex, this.selectedSpotIndex - 1);
                    this.klCanvasLayerArr = this.klCanvas.getLayers();
                    this.selectedSpotIndex--;
                    this.onSelect(this.selectedSpotIndex, false);
                    this.updateButtons();
                };

                renameBtn.onclick = () => {
                    this.applyUncommitted();
                    this.renameLayer(this.selectedSpotIndex);
                };

                this.clipBtn.onclick = () => {
                    this.applyUncommitted();
                    const currentLayer = this.klCanvas.getLayer(this.selectedSpotIndex);
                    const newClipped = !currentLayer.isClipped;
                    this.klCanvas.setLayerClipped(this.selectedSpotIndex, newClipped);
                    for (const spot of this.multiSelectedSpots) {
                        if (spot > 0 && !this.klCanvasLayerArr[spot]?.isBackground) {
                            this.klCanvas.setLayerClipped(spot, newClipped);
                        }
                    }
                    this.onSelect(this.selectedSpotIndex, false);
                };
            };
            setTimeout(async, 1);
            return div;
        };
        this.rootEl.append(createButtons());

        let modeWrapper;
        {
            modeWrapper = BB.el({
                content: LANG('layers-blending') + '&nbsp;',
                css: {
                    fontSize: '15px',
                },
            });

            this.modeSelect = new Select<TMixMode>({
                optionArr: [
                    'source-over',
                    undefined,
                    'darken',
                    'multiply',
                    'color-burn',
                    undefined,
                    'lighten',
                    'screen',
                    'color-dodge',
                    undefined,
                    'overlay',
                    'soft-light',
                    'hard-light',
                    undefined,
                    'difference',
                    'exclusion',
                    undefined,
                    'hue',
                    'saturation',
                    'color',
                    'luminosity',
                ].map((item: any) => {
                    return item ? [item, translateBlending(item)] : undefined;
                }),
                onChange: (val) => {
                    this.klCanvas.setMixMode(this.selectedSpotIndex, val as TMixMode);
                    for (const spot of this.multiSelectedSpots) {
                        this.klCanvas.setMixMode(spot, val as TMixMode);
                    }
                    this.update(this.selectedSpotIndex);
                },
                css: {
                    marginBottom: '10px',
                },
                name: 'layer-blend-mode',
            });

            modeWrapper.append(this.modeSelect.getElement());
            this.rootEl.append(modeWrapper);
        }

        this.rootEl.append(listDiv);

        this.klHistory.addListener(() => {
            if (this.rootEl.style.display !== 'block') {
                return;
            }
            this.createLayerList();
        });

        this.createLayerList();
    }

    // ---- interface ----
    update(activeLayerSpotIndex?: number): void {
        this.klCanvasLayerArr = this.klCanvas.getLayers();
        if (activeLayerSpotIndex || activeLayerSpotIndex === 0) {
            this.selectedSpotIndex = activeLayerSpotIndex;
        }
        this.updateButtons();
        if (this.isVisible) {
            this.createLayerList();
        }
    }

    getSelected(): number {
        return this.selectedSpotIndex;
    }

    activateLayer(spotIndex: number): void {
        if (spotIndex < 0 || spotIndex > this.layerElArr.length - 1) {
            throw (
                'invalid spotIndex ' + spotIndex + ', layerElArr.length ' + this.layerElArr.length
            );
        }
        this.selectedSpotIndex = spotIndex;
        this.modeSelect.setValue(this.klCanvasLayerArr[this.selectedSpotIndex].mixModeStr);
        for (let i = 0; i < this.layerElArr.length; i++) {
            const layer = this.layerElArr[i];
            const isSelected = this.selectedSpotIndex === layer.spot;

            css(layer, {
                boxShadow: '',
            });
            layer.classList.toggle('kl-layer--selected', isSelected);
            layer.classList.remove('kl-layer--multi-selected');
            layer.opacitySlider.setActive(isSelected);
            layer.isSelected = isSelected;
        }
        this.mergeBtn.disabled = this.selectedSpotIndex === 0;
    }

    private refreshMultiSelectHighlight(): void {
        for (let i = 0; i < this.layerElArr.length; i++) {
            const el = this.layerElArr[i];
            el.classList.toggle('kl-layer--multi-selected', this.multiSelectedSpots.has(el.spot));
        }
    }

    setUiState(stateStr: TUiLayout): void {
        this.uiState = stateStr;

        if (this.uiState === 'left') {
            css(this.largeThumbDiv, {
                left: '280px',
                right: '',
            });
        } else {
            css(this.largeThumbDiv, {
                left: '',
                right: '280px',
            });
        }
    }

    getElement(): HTMLElement {
        return this.rootEl;
    }

    advancedMergeDialog(): void {
        this.applyUncommitted();
        if (this.selectedSpotIndex <= 0) {
            return;
        }
        mergeLayerDialog(this.parentEl, {
            topCanvas: this.klCanvasLayerArr[this.selectedSpotIndex].context.canvas,
            bottomCanvas: this.klCanvasLayerArr[this.selectedSpotIndex - 1].context.canvas,
            topOpacity: this.klCanvas.getLayerOld(this.selectedSpotIndex)!.opacity,
            mixModeStr: this.klCanvasLayerArr[this.selectedSpotIndex].mixModeStr,
            callback: (mode) => {
                this.klCanvas.mergeLayers(
                    this.selectedSpotIndex,
                    this.selectedSpotIndex - 1,
                    mode as TMixMode | 'as-alpha',
                );
                this.klCanvasLayerArr = this.klCanvas.getLayers();
                this.selectedSpotIndex--;

                //this.createLayerList();
                this.onSelect(this.selectedSpotIndex, false);

                this.updateButtons();
            },
        });
    }

    setIsVisible(b: boolean): void {
        if (b === this.isVisible) {
            return;
        }
        this.isVisible = b;
        this.rootEl.style.display = b ? 'block' : 'none';
    }

    getMaskEditLayerIndex(): number | null {
        return null;
    }

    exitMaskEditMode(): void {
        // no-op: mask edit mode removed
    }
}
