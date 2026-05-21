import { BB } from '../../bb/bb';
import { isLayerFill, TKlProject, TKlProjectLayer } from '../kl-types';
import { MultiPolygon } from 'polygon-clipping';
import { transformMultiPolygon } from '../../bb/multi-polygon/transform-multi-polygon';
import { scale } from 'transformation-matrix';
import { getSelectionPath2d } from '../../bb/multi-polygon/get-selection-path-2d';

/**
 * Draw a single layer's image content to the given context.
 * Does NOT apply opacity or blend mode  caller is responsible for those.
 */
function drawLayerImage(
    targetCtx: CanvasRenderingContext2D,
    layer: TKlProjectLayer,
    w: number,
    h: number,
    pixelated: boolean,
): void {
    if (isLayerFill(layer.image)) {
        targetCtx.fillStyle = layer.image.fill;
        targetCtx.fillRect(0, 0, w, h);
    } else if (layer.image instanceof Array) {
        throw new Error('drawProject: tile arrays not supported here');
    } else {
        if (pixelated) targetCtx.imageSmoothingEnabled = false;
        targetCtx.drawImage(layer.image as HTMLImageElement | HTMLCanvasElement, 0, 0, w, h);
    }
}

export function drawProject(
    project: TKlProject,
    factor: number,
    selection?: MultiPolygon,
): HTMLCanvasElement {
    const w = Math.max(1, Math.round(project.width * factor));
    const h = Math.max(1, Math.round(project.height * factor));
    const pixelated = factor > 1;

    const resultCanvas = BB.canvas(w, h);
    const transformedSelection = selection
        ? transformMultiPolygon(
              selection,
              scale(w / project.width, h / project.height),
          )
        : undefined;

    const ctx = BB.ctx(resultCanvas);
    ctx.save();
    if (transformedSelection) {
        ctx.clip(getSelectionPath2d(transformedSelection));
    }

    const layers = project.layers;

    // Build a set of layer indices that are folder children, keyed by folderId.
    const folderChildrenMap = new Map<string, TKlProjectLayer[]>();
    const folderLayerMap = new Map<string, TKlProjectLayer>();
    const childIndices = new Set<number>();
    for (let k = 0; k < layers.length; k++) {
        const l = layers[k];
        if (l.isFolder && l.id) {
            folderLayerMap.set(l.id, l);
            folderChildrenMap.set(l.id, []);
        }
    }
    for (let k = 0; k < layers.length; k++) {
        const l = layers[k];
        if (l.folderId && folderChildrenMap.has(l.folderId)) {
            folderChildrenMap.get(l.folderId)!.push(l);
            childIndices.add(k);
        }
    }

    // Walk layers bottom -> top, grouping clipped layers with their base.
    let i = 0;
    while (i < layers.length) {
        // Skip layers that are children of a folder  they are rendered inside the folder group.
        if (childIndices.has(i)) {
            i++;
            continue;
        }

        const baseLayer = layers[i];

        // Collect consecutive clipped layers directly above this base
        // (but only non-folder-children, since those are handled via folder groups)
        const clippedLayers: TKlProjectLayer[] = [];
        let j = i + 1;
        while (j < layers.length && layers[j].isClipped && !childIndices.has(j)) {
            clippedLayers.push(layers[j]);
            j++;
        }
        i = j;

        if (!baseLayer.isVisible || baseLayer.opacity === 0) {
            // Invisible base  skip the whole clipping group
            continue;
        }

        // ── Folder group ──
        if (baseLayer.isFolder && baseLayer.id) {
            const folderChildren = folderChildrenMap.get(baseLayer.id) ?? [];
            if (folderChildren.length === 0) {
                // Empty folder  nothing to draw
                continue;
            }

            const folderCanvas = BB.canvas(w, h);
            const folderCtx = BB.ctx(folderCanvas);

            // Walk folder children bottom->top, handle clipping within the folder
            let ci = 0;
            while (ci < folderChildren.length) {
                const childBase = folderChildren[ci];
                const childClipped: TKlProjectLayer[] = [];
                let cj = ci + 1;
                while (cj < folderChildren.length && folderChildren[cj].isClipped) {
                    childClipped.push(folderChildren[cj]);
                    cj++;
                }
                ci = cj;

                if (!childBase.isVisible || childBase.opacity === 0) continue;

                if (childClipped.length === 0) {
                    folderCtx.globalAlpha = childBase.opacity;
                    folderCtx.globalCompositeOperation = (childBase.mixModeStr ?? 'source-over') as GlobalCompositeOperation;
                    drawLayerImage(folderCtx, childBase, w, h, pixelated);
                    folderCtx.globalAlpha = 1;
                    folderCtx.globalCompositeOperation = 'source-over';
                } else {
                    const cbCanvas = BB.canvas(w, h);
                    const cbCtx = BB.ctx(cbCanvas);
                    drawLayerImage(cbCtx, childBase, w, h, pixelated);

                    const cgCanvas = BB.canvas(w, h);
                    const cgCtx = BB.ctx(cgCanvas);
                    cgCtx.drawImage(cbCanvas, 0, 0);

                    for (const cl of childClipped) {
                        if (!cl.isVisible || cl.opacity === 0) continue;
                        const clCanvas = BB.canvas(w, h);
                        const clCtx = BB.ctx(clCanvas);
                        drawLayerImage(clCtx, cl, w, h, pixelated);
                        clCtx.globalCompositeOperation = 'destination-in';
                        clCtx.drawImage(cbCanvas, 0, 0);
                        cgCtx.globalAlpha = cl.opacity;
                        cgCtx.globalCompositeOperation = (cl.mixModeStr ?? 'source-over') as GlobalCompositeOperation;
                        cgCtx.drawImage(clCanvas, 0, 0);
                        cgCtx.globalAlpha = 1;
                        cgCtx.globalCompositeOperation = 'source-over';
                        BB.freeCanvas(clCanvas);
                    }

                    folderCtx.globalAlpha = childBase.opacity;
                    folderCtx.globalCompositeOperation = (childBase.mixModeStr ?? 'source-over') as GlobalCompositeOperation;
                    folderCtx.drawImage(cgCanvas, 0, 0);
                    folderCtx.globalAlpha = 1;
                    folderCtx.globalCompositeOperation = 'source-over';
                    BB.freeCanvas(cbCanvas);
                    BB.freeCanvas(cgCanvas);
                }
            }

            // Blend the folder group onto the result
            ctx.globalAlpha = baseLayer.opacity;
            ctx.globalCompositeOperation = (baseLayer.mixModeStr ?? 'source-over') as GlobalCompositeOperation;
            ctx.drawImage(folderCanvas, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            BB.freeCanvas(folderCanvas);
            continue;
        }

        if (clippedLayers.length === 0) {
            // ── Simple layer ──
            ctx.globalAlpha = baseLayer.opacity;
            ctx.globalCompositeOperation = (baseLayer.mixModeStr ?? 'source-over') as GlobalCompositeOperation;
            drawLayerImage(ctx, baseLayer, w, h, pixelated);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        } else {
            // ── Clipping group ──
            // Draw base at full alpha so we can use it as a mask for all clipped layers.
            const baseCanvas = BB.canvas(w, h);
            const baseCtx = BB.ctx(baseCanvas);
            drawLayerImage(baseCtx, baseLayer, w, h, pixelated);

            // Start the group with the base content.
            const groupCanvas = BB.canvas(w, h);
            const groupCtx = BB.ctx(groupCanvas);
            groupCtx.drawImage(baseCanvas, 0, 0);

            // Each clipped layer: render -> clip by base alpha -> blend into group.
            for (const clipLayer of clippedLayers) {
                if (!clipLayer.isVisible || clipLayer.opacity === 0) continue;

                const clipCanvas = BB.canvas(w, h);
                const clipCtx = BB.ctx(clipCanvas);
                drawLayerImage(clipCtx, clipLayer, w, h, pixelated);

                // Clip to base alpha
                clipCtx.globalCompositeOperation = 'destination-in';
                clipCtx.globalAlpha = 1;
                clipCtx.drawImage(baseCanvas, 0, 0);

                // Blend into group
                groupCtx.globalAlpha = clipLayer.opacity;
                groupCtx.globalCompositeOperation = (clipLayer.mixModeStr ?? 'source-over') as GlobalCompositeOperation;
                groupCtx.drawImage(clipCanvas, 0, 0);
                groupCtx.globalAlpha = 1;
                groupCtx.globalCompositeOperation = 'source-over';

                BB.freeCanvas(clipCanvas);
            }

            // Composite the whole group onto the result at the base's blend mode/opacity.
            ctx.globalAlpha = baseLayer.opacity;
            ctx.globalCompositeOperation = (baseLayer.mixModeStr ?? 'source-over') as GlobalCompositeOperation;
            ctx.drawImage(groupCanvas, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            BB.freeCanvas(baseCanvas);
            BB.freeCanvas(groupCanvas);
        }
    }

    ctx.restore();
    return resultCanvas;
}


