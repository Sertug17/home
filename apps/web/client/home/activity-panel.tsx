"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  ActivityPanel,
  type ActivityPanelDensity,
  type FetchActivity,
} from "@/client/activity";
import { RecentMoneyActions } from "@/client/money-actions";
import type { VerifiedAccountSession } from "@/shared/account/session-types";
import type { RegionId } from "@/config/regions";
import { ShimmerRows } from "./panel-shared";

export function ActivityPage({
  activitySession,
  fetchActivity,
  fetchOperations,
  regionId,
  showSessionShimmer,
}: {
  activitySession: VerifiedAccountSession | null;
  fetchActivity: FetchActivity;
  fetchOperations: (signal?: AbortSignal) => Promise<unknown>;
  regionId: RegionId;
  showSessionShimmer: boolean;
}) {
  if (showSessionShimmer) {
    return (
      <section
        className="activity-panel nested-home-panel"
        aria-label="Activity"
        aria-busy="true"
      >
        <ShimmerRows count={4} />
      </section>
    );
  }
  return (
    <div className="activity-panel activity-panel-slot nested-home-panel">
      <ConnectedActivityPanel
        density="page"
        header={null}
        activitySession={activitySession}
        fetchActivity={fetchActivity}
        fetchOperations={fetchOperations}
        regionId={regionId}
      />
    </div>
  );
}

export function ConnectedActivityPanel({
  density,
  header,
  activitySession,
  fetchActivity,
  fetchOperations,
  regionId,
}: {
  density: ActivityPanelDensity;
  header?: ReactNode | null;
  activitySession: VerifiedAccountSession | null;
  fetchActivity: FetchActivity;
  fetchOperations: (signal?: AbortSignal) => Promise<unknown>;
  regionId: RegionId;
}) {
  const [indexedTransactionHashes, setIndexedTransactionHashes] = useState<string[]>([]);
  const [localActionCount, setLocalActionCount] = useState(0);
  const updateIndexedTransactionHashes = useCallback((hashes: string[]) => {
    setIndexedTransactionHashes((current) =>
      current.length === hashes.length &&
      current.every((hash, index) => hash === hashes[index])
        ? current
        : hashes,
    );
  }, []);

  return (
    <ActivityPanel
      session={activitySession}
      fetchActivity={fetchActivity}
      regionId={regionId}
      onTransactionHashesChange={updateIndexedTransactionHashes}
      suppressEmpty={localActionCount > 0}
      density={density}
      header={header}
      leading={
        <RecentMoneyActions
          session={activitySession}
          fetchOperations={fetchOperations}
          excludeTransactionHashes={indexedTransactionHashes}
          embedded
          showUnavailableNotice={false}
          onVisibleCountChange={setLocalActionCount}
        />
      }
    />
  );
}
