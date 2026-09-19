"use client";

import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { LoginScreen } from "@/components/LoginScreen";
import { isUnlocked } from "@/lib/auth";

export default function Home() {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setOk(isUnlocked());
  }, []);

  if (!ok) {
    return <LoginScreen onUnlock={() => setOk(true)} />;
  }

  return <Dashboard onLock={() => setOk(false)} />;
}
