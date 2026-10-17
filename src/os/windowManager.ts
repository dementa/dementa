import { getApp, type AppId } from "./apps";

export interface WinState {
  appId: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Fixed to the left or right half of the screen. x/y/w/h keep the size to restore to. */
  snap: Snap;
}

export type Snap = "left" | "right" | null;

export const MIN_W = 280;
export const MIN_H = 180;

export interface WMState {
  windows: WinState[];
  nextZ: number;
}

export type WMAction =
  | { type: "open"; appId: AppId; vw: number; vh: number }
  | { type: "close"; appId: AppId }
  | { type: "focus"; appId: AppId }
  | { type: "minimize"; appId: AppId }
  | { type: "toggleMax"; appId: AppId }
  | { type: "move"; appId: AppId; x: number; y: number }
  | { type: "resize"; appId: AppId; x: number; y: number; w: number; h: number }
  | { type: "snap"; appId: AppId; snap: Snap | "max" }
  /** Dragging a snapped/maximised window away returns it to its normal size at the pointer. */
  | { type: "unsnap"; appId: AppId; x: number; y: number }
  /** Taskbar/dock click: restore if minimised, minimise if already in front, otherwise bring to front. */
  | { type: "activate"; appId: AppId }
  | { type: "minimizeAll" }
  | { type: "closeAll" };

export const initialWM: WMState = { windows: [], nextZ: 1 };

/** The window currently in front (highest z, not minimised). */
export function topWindow(state: WMState): WinState | undefined {
  return state.windows
    .filter((w) => !w.minimized)
    .reduce<WinState | undefined>((top, w) => (!top || w.z > top.z ? w : top), undefined);
}

function update(state: WMState, appId: AppId, patch: Partial<WinState>, raise = false): WMState {
  return {
    nextZ: raise ? state.nextZ + 1 : state.nextZ,
    windows: state.windows.map((w) =>
      w.appId === appId ? { ...w, ...patch, ...(raise ? { z: state.nextZ } : {}) } : w,
    ),
  };
}

export function wmReducer(state: WMState, action: WMAction): WMState {
  switch (action.type) {
    case "open": {
      if (state.windows.some((w) => w.appId === action.appId)) {
        return update(state, action.appId, { minimized: false }, true);
      }
      const n = state.windows.length % 6;
      const size = getApp(action.appId).size ?? { w: 600, h: 420 };
      const w = Math.min(size.w, action.vw - 32);
      const h = Math.min(size.h, action.vh - 140);
      const win: WinState = {
        appId: action.appId,
        x: Math.max(16, Math.min(140 + n * 32, action.vw - w - 16)),
        y: Math.min(60 + n * 32, Math.max(16, action.vh - h - 80)),
        w,
        h,
        z: state.nextZ,
        minimized: false,
        maximized: action.vw < 640,
        snap: null,
      };
      return { windows: [...state.windows, win], nextZ: state.nextZ + 1 };
    }
    case "close":
      return { ...state, windows: state.windows.filter((w) => w.appId !== action.appId) };
    case "focus":
      return update(state, action.appId, {}, true);
    case "minimize":
      return update(state, action.appId, { minimized: true });
    case "toggleMax": {
      const win = state.windows.find((w) => w.appId === action.appId);
      if (!win) return state;
      const restore = win.maximized || win.snap !== null;
      return update(state, action.appId, { maximized: !restore, snap: null }, true);
    }
    case "move":
      return update(state, action.appId, { x: action.x, y: action.y });
    case "resize":
      return update(state, action.appId, { x: action.x, y: action.y, w: action.w, h: action.h });
    case "snap":
      return update(
        state,
        action.appId,
        action.snap === "max" ? { maximized: true, snap: null } : { maximized: false, snap: action.snap },
        true,
      );
    case "unsnap":
      return update(state, action.appId, { x: action.x, y: action.y, maximized: false, snap: null });
    case "activate": {
      const win = state.windows.find((w) => w.appId === action.appId);
      if (!win) return state;
      if (win.minimized) return update(state, action.appId, { minimized: false }, true);
      if (topWindow(state)?.appId === action.appId) return update(state, action.appId, { minimized: true });
      return update(state, action.appId, {}, true);
    }
    case "minimizeAll":
      return { ...state, windows: state.windows.map((w) => ({ ...w, minimized: true })) };
    case "closeAll":
      return initialWM;
  }
}
