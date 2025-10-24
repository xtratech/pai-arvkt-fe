import { getSessionsData } from "../fetch";
import { Suspense } from "react";
import { SessionCard } from "./session-card";

export async function SessionList() {
  const data = await getSessionsData();

  return (
    <div className="grid grid-cols-6 gap-8">
      {data.map((session, idx) => (
        <div key={session.id ?? idx} className="col-span-3 xl:col-span-2">
          <Suspense fallback={null}>
            <SessionCard session={session as any} />
          </Suspense>
        </div>
      ))}
    </div>
  );
}
