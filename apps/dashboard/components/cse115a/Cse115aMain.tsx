export function Cse115aMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-start py-6 px-4 sm:px-6 min-h-[calc(100vh-4rem)] bg-slate-50 text-slate-900">
      {children}
    </main>
  );
}
