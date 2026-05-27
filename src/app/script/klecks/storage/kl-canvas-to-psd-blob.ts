import { KL } from '../kl';
import { KlCanvas } from '../canvas/kl-canvas';
import { Psd } from 'ag-psd/dist/psd';
import { loadAgPsd } from './load-ag-psd';
import { BB } from '../../bb/bb';

export async function klCanvasToPsdBlob(klCanvas: KlCanvas): Promise<Blob> {
    const layerArr = klCanvas.getLayersFast();
    const width = klCanvas.getWidth();
    const height = klCanvas.getHeight();

    const psdConfig: Psd = {
        width,
        height,
        //canvas: klCanvas.getCompleteCanvas(1), // preview, can be skipped
        children: layerArr.map((item) => {
            // If a compositeObj is active, bake it into a fresh full-size canvas
            // so the exported layer data exactly matches what is rendered on screen
            // (pixel-perfect, no unfilled border artifacts).
            let canvas = item.canvas;
            if (item.compositeObj) {
                canvas = BB.canvas(width, height);
                const ctx = BB.ctx(canvas);
                ctx.drawImage(item.canvas, 0, 0);
                item.compositeObj.draw(ctx);
            }
            return {
                name: item.name,
                hidden: !item.isVisible,
                opacity: item.opacity,
                canvas,
                blendMode: KL.PSD.blendKlToPsd(item.mixModeStr),
                left: 0,
                top: 0,
            };
        }),
    };

    const agPsd = await loadAgPsd();
    const buffer = agPsd.writePsdBuffer(psdConfig);
    return new Blob([buffer], { type: 'application/octet-stream' });
}
