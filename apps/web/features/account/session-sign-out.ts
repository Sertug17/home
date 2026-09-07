export type SuppressedSessionOwner = string | null;

export function isSessionSuppressedForOwner(
  suppressedOwnerKey: SuppressedSessionOwner,
  currentOwnerKey: string | null,
): boolean {
  return suppressedOwnerKey !== null && suppressedOwnerKey === currentOwnerKey;
}

export async function signOutWithSessionSuppressed({
  ownerKey,
  signOut,
  suppress,
  onFailure,
}: {
  ownerKey: string;
  signOut: () => Promise<void>;
  suppress: (ownerKey: string) => void;
  onFailure: () => void;
}): Promise<boolean> {
  suppress(ownerKey);

  try {
    await signOut();
    return true;
  } catch {
    onFailure();
    return false;
  }
}
