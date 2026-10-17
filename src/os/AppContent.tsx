"use client";

import { getApp, type AppId } from "./apps";
import { AppTile } from "./common";

export function ComingSoon({ appId }: { appId: AppId }) {
  const app = getApp(appId);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <AppTile app={app} size={80} />
      <h2 className="text-2xl font-bold">{app.name}</h2>
      <p className="max-w-xs text-slate-600">{app.blurb}</p>
      <span className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-800">Coming soon!</span>
    </div>
  );
}
