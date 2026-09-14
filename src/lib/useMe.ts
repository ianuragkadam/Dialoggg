"use client";

import { useEffect, useState } from "react";

export type Me = {
  id: number; email: string; full_name: string | null;
  user_type: string; company_id: number | null;
};

// Lightweight client hook: returns the current user (or null) and whether they can edit.
export function useMe(): { me: Me | null; canEdit: boolean; loading: boolean } {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/me")
      .then(r => (r.ok ? r.json() : { user: null }))
      .then(j => setMe(j.user ?? null))
      .finally(() => setLoading(false));
  }, []);
  return { me, canEdit: me?.user_type === "admin", loading };
}
