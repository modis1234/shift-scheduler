"use client";

import { useEffect } from "react";

/** 오프라인 안내용 서비스 워커(public/sw.js) 등록. 개발 서버에서는 등록하지 않는다 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
