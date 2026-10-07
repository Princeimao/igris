import React from "react";
import { DynamicIsland } from "./components/island/DynamicIsland";
import { TooltipProvider } from "./components/ui/tooltip";

export default function App() {
  return (
    <TooltipProvider delay={150}>
      <main className="relative h-screen w-screen overflow-hidden bg-transparent">
        <DynamicIsland />
      </main>
    </TooltipProvider>
  );
}
