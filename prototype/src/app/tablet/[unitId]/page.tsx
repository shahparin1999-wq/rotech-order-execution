"use client";

// /tablet/[unitId] is retired.
//
// It existed because the Unit page was desktop-shaped, so the shop floor
// needed a separate large-control view. That split is gone: the Unit
// workspace is touch-first for everyone, and its action controls are the
// same large ones this route used to own.
//
// The route stays as a redirect because it is linked from existing QR
// landings and bookmarks — a printed label must not lead to a dead end.

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function TabletRedirect({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  const router = useRouter();
  const target = `/units/${encodeURIComponent(decodeURIComponent(unitId))}`;

  useEffect(() => {
    router.replace(target);
  }, [router, target]);

  return (
    <div className="page">
      <p>
        The shop-floor view is now the Unit page. <Link href={target}>Open {decodeURIComponent(unitId)}</Link>
      </p>
    </div>
  );
}
