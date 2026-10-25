import { AgentTable } from "./AgentTable";
import { SectorOrderList } from "./SectorOrderList";

export function ListView() {
  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row-reverse">
        <SectorOrderList />
        <AgentTable />
      </div>
    </div>
  );
}
