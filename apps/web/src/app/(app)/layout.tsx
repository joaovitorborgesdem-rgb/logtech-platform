import { AppNav } from "@/components/app-nav";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 flex-col">
      <AppNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
