import type { ReactNode } from 'react';

interface Props {
  header: ReactNode;
  leftColumn: ReactNode;
  centerColumn: ReactNode;
  rightColumn: ReactNode;
}

export function DashboardLayout({ header, leftColumn, centerColumn, rightColumn }: Props) {
  return (
    <div className="relative z-10 flex h-screen flex-col gap-2 p-3 overflow-hidden">
      <header className="grid shrink-0 grid-cols-3 gap-2">{header}</header>
      <div className="grid min-h-0 flex-1 grid-cols-12 grid-rows-1 gap-2 overflow-hidden">
        <section className="col-span-3 flex flex-col gap-2 min-h-0 overflow-hidden">{leftColumn}</section>
        <section className="col-span-6 flex flex-col min-h-0 overflow-hidden">{centerColumn}</section>
        <section className="col-span-3 flex flex-col min-h-0 overflow-hidden">{rightColumn}</section>
      </div>
    </div>
  );
}
