import { KlCanvas } from '../../canvas/kl-canvas';
import { Easel } from './easel';
import { BB } from '../../../bb/bb';
import { throwIfNull } from '../../../bb/base/base';

export type TEaselProjectUpdaterParams<T extends string> = {
    klCanvas: KlCanvas;
    easel: Easel<T>;
};

/**
 * Allows KlCanvas to be rendered by Easel.
 * Call update when KlCanvas changed (added layer, moved layer, removed layer, changed selection, redo/undo)
 */
export class EaselProjectUpdater<T extends string> {
    private readonly klCanvas: KlCanvas;
    private readonly easel: Easel<T>;
    private compositeCanvas: HTMLCanvasElement | undefined;
    // per-group canvases for clipping group compositing (keyed by base layer index)
    private groupCanvases: Map<number, HTMLCanvasElement> = new Map();

    // ----------------------------------- public -----------------------------------
    constructor(p: TEaselProjectUpdaterParams<T>) {
        this.klCanvas = p.klCanvas;
        this.easel = p.easel;
        this.update();
    }

    update(): void {
        const width = this.klCanvas.getWidth();
        const height = this.klCanvas.getHeight();
        const layers = this.klCanvas.getLayersFast();

        // free resources if no compositing being done (compositeObj path)
        if (layers.some((layer) => layer.compositeObj)) {
            if (!this.compositeCanvas) {
                this.compositeCanvas = BB.canvas(width, height);
            }
        } else {
            if (this.compositeCanvas) {
                BB.freeCanvas(this.compositeCanvas);
                this.compositeCanvas = undefined;
            }
        }
        const compositeCanvas = this.compositeCanvas;

        // Build easel layer list, collapsing clipping groups into single entries
        type TEaselLayer = {
            image: HTMLCanvasElement | (() => HTMLCanvasElement);
            isVisible: boolean;
            opacity: number;
            mixModeStr: string;
            hasClipping: boolean;
        };

        const easelLayers: TEaselLayer[] = [];
        const usedGroupKeys = new Set<number>();

        let i = 0;
        while (i < layers.length) {
            const baseLayer = layers[i];
            const baseIndex = i;

            // Collect consecutive clipped layers above this base
            const clippedGroup: (typeof layers[number])[] = [];
            let j = i + 1;
            while (j < layers.length && layers[j].isClipped) {
                clippedGroup.push(layers[j]);
                j++;
            }
            i = j;

            if (clippedGroup.length === 0) {
                // Simple layer — use compositeObj path if present, or raw canvas
                let image: HTMLCanvasElement | (() => HTMLCanvasElement);
                if (baseLayer.compositeObj && compositeCanvas) {
                    const capturedLayer = baseLayer;
                    image = () => {
                        if (compositeCanvas.width !== width || compositeCanvas.height !== height) {
                            compositeCanvas.width = width;
                            compositeCanvas.height = height;
                        }
                        const ctx = compositeCanvas.getContext('2d')!;
                        ctx.clearRect(0, 0, width, height);
                        ctx.drawImage(capturedLayer.canvas, 0, 0);
                        capturedLayer.compositeObj?.draw(
                            throwIfNull(compositeCanvas.getContext('2d')),
                        );
                        return compositeCanvas;
                    };
                } else {
                    image = baseLayer.canvas;
                }
                easelLayers.push({
                    image,
                    isVisible: baseLayer.isVisible,
                    opacity: baseLayer.opacity,
                    mixModeStr: baseLayer.mixModeStr,
                    hasClipping: false,
                });
            } else {
                // Clipping group — composite all layers into a group canvas
                usedGroupKeys.add(baseIndex);
                if (!this.groupCanvases.has(baseIndex)) {
                    this.groupCanvases.set(baseIndex, BB.canvas(width, height));
                }
                const groupCanvas = this.groupCanvases.get(baseIndex)!;

                const capturedBase = baseLayer;
                const capturedClipped = [...clippedGroup];

                const imageFunc = (): HTMLCanvasElement => {
                    // Ensure correct size
                    if (groupCanvas.width !== width || groupCanvas.height !== height) {
                        groupCanvas.width = width;
                        groupCanvas.height = height;
                    }

                    // Draw base to a temp canvas (used as clip mask)
                    const baseCanvas = BB.canvas(width, height);
                    const baseCtx = baseCanvas.getContext('2d')!;
                    baseCtx.drawImage(capturedBase.canvas, 0, 0);

                    // Start group with base content
                    const groupCtx = groupCanvas.getContext('2d')!;
                    groupCtx.clearRect(0, 0, width, height);
                    groupCtx.drawImage(baseCanvas, 0, 0);

                    // Composite each clipped layer, clipped to base alpha
                    for (const clipLayer of capturedClipped) {
                        if (!clipLayer.isVisible || clipLayer.opacity === 0) continue;

                        const clipCanvas = BB.canvas(width, height);
                        const clipCtx = clipCanvas.getContext('2d')!;
                        clipCtx.drawImage(clipLayer.canvas, 0, 0);

                        // Restrict to base alpha
                        clipCtx.globalCompositeOperation = 'destination-in';
                        clipCtx.drawImage(baseCanvas, 0, 0);

                        // Blend into group
                        groupCtx.globalAlpha = clipLayer.opacity;
                        groupCtx.globalCompositeOperation = clipLayer.mixModeStr as GlobalCompositeOperation;
                        groupCtx.drawImage(clipCanvas, 0, 0);
                        groupCtx.globalAlpha = 1;
                        groupCtx.globalCompositeOperation = 'source-over';

                        BB.freeCanvas(clipCanvas);
                    }

                    BB.freeCanvas(baseCanvas);
                    return groupCanvas;
                };

                // The whole group is rendered at the base layer's opacity/blend mode
                easelLayers.push({
                    image: imageFunc,
                    isVisible: baseLayer.isVisible,
                    opacity: baseLayer.opacity,
                    mixModeStr: baseLayer.mixModeStr,
                    hasClipping: false,
                });
            }
        }

        // Free group canvases no longer needed
        for (const [key, canvas] of this.groupCanvases.entries()) {
            if (!usedGroupKeys.has(key)) {
                BB.freeCanvas(canvas);
                this.groupCanvases.delete(key);
            }
        }

        this.easel.setProject({
            width,
            height,
            layers: easelLayers as any,
            selection: this.klCanvas.getSelection(),
        });
    }

    // if you're not rendering easel for a while
    freeCompositeCanvas(): void {
        if (this.compositeCanvas) {
            BB.freeCanvas(this.compositeCanvas);
            this.compositeCanvas = undefined;
        }
        for (const canvas of this.groupCanvases.values()) {
            BB.freeCanvas(canvas);
        }
        this.groupCanvases.clear();
    }
}
