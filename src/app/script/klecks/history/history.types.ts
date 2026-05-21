import { MultiPolygon } from 'polygon-clipping';
import { TLayerFill, TMixMode, TRgb } from '../kl-types';

export type TLayerId = string;
export type TImageDataTile = {
    id: string;
    /*
    // unix timestamp
    timestamp: number;
     */
    data: ImageData;
};
// image data, or a fill color
// can be transparent: {fill: 'transparent'} -> useful if empty layer
export type THistoryEntryLayerTile = TImageDataTile | TLayerFill;
export type THistoryEntryLayer = {
    // if layer exists but did not change, must be in the layerMap. object can be empty

    // if name changed
    name?: string;

    // if opacity changed
    opacity?: number;

    // if visibility changed
    isVisible?: boolean;

    // if blend mode changed
    mixModeStr?: TMixMode;

    // if index changed (did it move up or down)
    index?: number;

    // if contents changed
    tiles?: (THistoryEntryLayerTile | undefined)[]; // undefined if tile did not change

    // if clipping changed (layer clips to layer below)
    isClipped?: boolean;

    // if background state changed
    isBackground?: boolean;
    backgroundColor?: TRgb;

    // if folder state changed
    isFolder?: boolean;       // true = this layer is a folder/group header
    isFolderOpen?: boolean;   // true = folder is expanded in UI
    folderId?: string | null; // ID of the folder this layer belongs to (null = remove from folder)
};
export type THistoryEntryData = {
    // if project changed
    projectId?: {
        value: string; // uuid
    };

    // if size changed
    size?: {
        width: number;
        height: number;
    };

    // if selection changed
    selection?: {
        value?: MultiPolygon;
    };

    // if active layer changed
    activeLayerId?: string;

    // if layers changed
    // map, so can quickly project through
    layerMap?: Record<TLayerId, THistoryEntryLayer>;
};

export type THistoryEntry = {
    timestamp: number; // maybe for comparing with indexedDB?
    memoryEstimateBytes: number;
    description?: string; // human-readable description of the action. e.g. 'brush stroke'
    data: THistoryEntryData;
};

export type THistoryEntryLayerComposed = Omit<Required<THistoryEntryLayer>, 'tiles' | 'folderId' | 'backgroundColor'> & {
    tiles: THistoryEntryLayerTile[];
    isClipped: boolean;
    isFolder: boolean;
    isFolderOpen: boolean;
    folderId?: string; // present only when layer belongs to a folder
    backgroundColor?: TRgb; // optional, only for background layers
};

export type THistoryEntryDataComposed = Omit<Required<THistoryEntryData>, 'layerMap'> & {
    layerMap: Record<TLayerId, THistoryEntryLayerComposed>;
};
