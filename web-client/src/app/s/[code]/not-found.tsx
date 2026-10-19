import Image from "next/image";

// /s/<코드>의 404 화면(잘못·중지된 링크, 베타 꺼짐). 어느 쪽인지 구분하지 않는다
export default function StaffNotFound() {
  return (
    <div className="min-h-screen">
      <header className="app-header border-b border-border">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Image src="/app-icon.svg" alt="" width={28} height={28} unoptimized className="rounded-lg" />
          <h1 className="text-[15px] font-bold tracking-[-0.01em]">근무표</h1>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-4">
        <p role="alert" className="alert alert-danger">
          링크를 열 수 없습니다. 매장 관리자에게 새 링크를 요청해 주세요.
        </p>
      </main>
    </div>
  );
}
