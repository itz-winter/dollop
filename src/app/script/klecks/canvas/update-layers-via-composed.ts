import { HISTORY_TILE_SIZE } from '../history/kl-history';
import { TKlCanvasLayer } from './kl-canvas';
import { THistoryEntryDataComposed } from '../history/history.types';
import { BB } from '../../bb/bb';
import { sortLayerMap } from '../history/sort-layer-map';
import { isLayerFill } from '../kl-types';

function applyTilesToCanvas(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    tiles: (import('../history/history.types').THistoryEntryLayerTile | undefined)[],
    tilesPerX: number,
    prevTiles?: (import('../history/history.types').THistoryEntryLayerTile | undefined)[],
): void {
    tiles.forEach((item, index) => {
        if (prevTiles && item === prevTiles[index]) return;
        const x = index % tilesPerX;
        const y = Math.floor(index / tilesPerX);
        if (isLayerFill(item)) {
            context.save();
            context.fillStyle = item.fill;
            context.clearRect(x * HISTORY_TILE_SIZE, y * HISTORY_TILE_SIZE, HISTORY_TILE_SIZE, HISTORY_TILE_SIZE);
            context.fillRect(x * HISTORY_TILE_SIZE, y * HISTORY_TILE_SIZE, HISTORY_TILE_SIZE, HISTORY_TILE_SIZE);
            context.restore();
        } else if (item) {
            context.putImageData(item.data, x * HISTORY_TILE_SIZE, y * HISTORY_TILE_SIZE);
        }
    });
}

/**
 * Applies history delta to the project, optimized for performance.
 * note: modifies the canvases in project
 */
export function updateLayersViaComposed(
    layers: TKlCanvasLayer[],
    before: THistoryEntryDataComposed,
    after: THistoryEntryDataComposed,
): TKlCanvasLayer[] {
    const sizeDidChange =
        before.size.width !== after.size.width || before.size.height !== after.size.height;

    return Object.entries(after.layerMap)
        .map(([id, composedAfterLayer]) => {
            let canvas = {} as HTMLCanvasElement;
            let context = {} as CanvasRenderingContext2D;
            const composedBeforeLayer = before.layerMap[id];
            const tilesPerX = Math.ceil(after.size.width / HISTORY_TILE_SIZE);

            if (sizeDidChange || !composedBeforeLayer) {
                // create new canvas
                canvas = BB.canvas(after.size.width, after.size.height);
                context = BB.ctx(canvas);

                composedAfterLayer.tiles.forEach((item, index) => {
                    const x = index % tilesPerX;
                    const y = Math.floor(index / tilesPerX);
                    if (isLayerFill(item)) {
                        context.save();
                        context.fillStyle = item!.fill;
                        context.fillRect(
                            x * HISTORY_TILE_SIZE,
                            y * HISTORY_TILE_SIZE,
                            HISTORY_TILE_SIZE,
                            HISTORY_TILE_SIZE,
                        );
                        context.restore();
                    } else {
                        context.putImageData(
                            item.data,
                            x * HISTORY_TILE_SIZE,
                            y * HISTORY_TILE_SIZE,
                        );
                    }
                });
            } else {
                canvas = layers[composedBeforeLayer.index].canvas;
                context = layers[composedBeforeLayer.index].context;
                composedAfterLayer.tiles.forEach((item, index) => {
                    if (item === composedBeforeLayer.tiles[index]) {
                        // todo more advanced check ^
                        return;
                    }
                    const x = index % tilesPerX;
                    const y = Math.floor(index / tilesPerX);
                    if (isLayerFill(item)) {
                        context.save();
                        context.fillStyle = item.fill;
                        context.clearRect(
                            x * HISTORY_TILE_SIZE,
                            y * HISTORY_TILE_SIZE,
                            HISTORY_TILE_SIZE,
                            HISTORY_TILE_SIZE,
                        );
                        context.fillRect(
                            x * HISTORY_TILE_SIZE,
                            y * HISTORY_TILE_SIZE,
                            HISTORY_TILE_SIZE,
                            HISTORY_TILE_SIZE,
                        );
                        context.restore();
                    } else {
                        context.putImageData(
                            item.data,
                            x * HISTORY_TILE_SIZE,
                            y * HISTORY_TILE_SIZE,
                        );
                    }
                });
            }

            return {
                id,
                index: composedAfterLayer.index,
                name: composedAfterLayer.name,
                mixModeStr: composedAfterLayer.mixModeStr,
                isVisible: composedAfterLayer.isVisible,
                opacity: composedAfterLayer.opacity,
                canvas,
                context,
                isClipped: composedAfterLayer.isClipped || undefined,
                isBackground: composedAfterLayer.isBackground || undefined,
                backgroundColor: composedAfterLayer.backgroundColor,
                isFolder: composedAfterLayer.isFolder || undefined,
                isFolderOpen: composedAfterLayer.isFolderOpen,
                folderId: composedAfterLayer.folderId,
            };
        })
        .sort(sortLayerMap);
}
