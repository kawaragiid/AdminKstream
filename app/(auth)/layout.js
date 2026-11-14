export default function AuthLayout({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8">
      {children}
    </div>
  );
}
