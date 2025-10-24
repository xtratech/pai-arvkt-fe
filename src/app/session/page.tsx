import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { getSessionById, getSessionRunsBySessionId } from "./fetch";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Session Page",
};

type SessionSearchParams = Promise<{ id?: string }>;

export default async function SessionPage({
  searchParams,
}: {
  searchParams: SessionSearchParams;
}) {
  const { id } = await searchParams;

  if (!id) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="Session" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">No session id provided.</p>
        </div>
      </div>
    );
  }

  const session = await getSessionById(id);
  const runs = await getSessionRunsBySessionId(id);

  const prettyStatus = (status?: string) =>
    (status || "").split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const formatDateTime = (ts?: string) =>
    ts ? new Date(ts).toLocaleString() : "";

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-[1460px]">
        <Breadcrumb pageName="Session" />
        <div className="mt-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <p className="text-sm text-dark-5 dark:text-dark-6">Session not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1460px]">
      <Breadcrumb pageName="Session" />

      <div className="mt-6 grid grid-cols-12 gap-6">
        <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-body-2xlg font-bold text-dark dark:text-white">{session.name}</h2>
            <div className="flex items-center gap-4 text-sm">
              {session.status && (
                <span className="rounded-full bg-gray-2 px-3 py-1 text-xs text-dark dark:bg-dark-2 dark:text-dark-6">
                  {prettyStatus(session.status)}
                </span>
              )}
              {typeof session.overall_score !== "undefined" && (
                <span className="text-sm"><span className="text-dark-5 dark:text-dark-6">Score: </span>{session.overall_score}%</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 md:col-span-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-dark-5 dark:text-dark-6">ID</dt>
                <dd className="text-dark dark:text-white">{session.id}</dd>
                <dt className="text-dark-5 dark:text-dark-6">Created</dt>
                <dd className="text-dark dark:text-white">{formatDateTime(session.created_at)}</dd>
                <dt className="text-dark-5 dark:text-dark-6">Updated</dt>
                <dd className="text-dark dark:text-white">{formatDateTime(session.updated_at)}</dd>
                <dt className="text-dark-5 dark:text-dark-6">User</dt>
                <dd className="text-dark dark:text-white">{session.user_id || "-"}</dd>
                <dt className="text-dark-5 dark:text-dark-6">Mode</dt>
                <dd className="text-dark dark:text-white">{session.config?.mode || "-"}</dd>
                <dt className="text-dark-5 dark:text-dark-6">Max Iterations</dt>
                <dd className="text-dark dark:text-white">{session.config?.max_iterations ?? "-"}</dd>
              </dl>
            </div>

            <div className="col-span-12 md:col-span-6">
              <div>
                <div className="mb-2 text-sm font-medium text-dark dark:text-white">System Prompt</div>
                <Link
                  href={`/system-prompt?session_id=${session.id}`}
                  className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                >
                  View system prompt details
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <h3 className="mb-4 text-lg font-semibold text-dark dark:text-white">Knowledgebase</h3>
          <Link
            href={`/kb?session_id=${session.id}`}
            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            View knowledgebase details
          </Link>
        </div>

        <div className="col-span-12 md:col-span-6 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
          <h3 className="mb-4 text-lg font-semibold text-dark dark:text-white">Test Queries</h3>
          <div className="space-y-3">
            {(session.test_queries || []).map((q, i) => (
              <div key={i} className="rounded-md border border-gray-2 p-3 dark:border-dark-2">
                <div className="text-sm"><span className="text-dark-5 dark:text-dark-6">Query:</span> {q.query}</div>
                {q.expected_answer && (
                  <div className="text-sm"><span className="text-dark-5 dark:text-dark-6">Expected:</span> {q.expected_answer}</div>
                )}
                {q.tags && q.tags.length > 0 && (
                  <div className="text-xs text-dark-5 dark:text-dark-6">Tags: {q.tags.join(", ")}</div>
                )}
              </div>
            ))}
            {!session.test_queries || session.test_queries.length === 0 ? (
              <div className="text-sm text-dark-5 dark:text-dark-6">No test queries.</div>
            ) : null}
          </div>
        </div>

        <div className="col-span-12 rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-dark dark:text-white">Session Runs</h3>
          </div>
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-neutral-100/50 data-[state=selected]:bg-neutral-100 dark:border-dark-3 dark:hover:bg-dark-2 dark:data-[state=selected]:bg-neutral-800 border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-4 [&>th]:text-base [&>th]:text-dark [&>th]:dark:text-white">
                  <th className="h-12 px-4 text-left align-middle font-medium text-neutral-500 dark:text-neutral-400 min-w-[155px] xl:pl-7.5">Iteration</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-neutral-500 dark:text-neutral-400">Timestamp</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-neutral-500 dark:text-neutral-400">Status</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-neutral-500 dark:text-neutral-400">Score</th>
                  <th className="h-12 px-4 align-middle font-medium text-neutral-500 dark:text-neutral-400 text-right xl:pr-7.5">Actions</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {runs.map((run) => {
                  const status = String(run.status || "").toLowerCase();
                  let badgeBg = "bg-[#6B7280]/[0.08]";
                  let badgeText = "text-[#6B7280]";
                  if (status === "success") {
                    badgeBg = "bg-[#219653]/[0.08]";
                    badgeText = "text-[#219653]";
                  } else if (status === "failed") {
                    badgeBg = "bg-[#D34053]/[0.08]";
                    badgeText = "text-[#D34053]";
                  } else if (status === "needs_review" || status === "pending") {
                    badgeBg = "bg-[#FFA70B]/[0.08]";
                    badgeText = "text-[#FFA70B]";
                  }
                  return (
                    <tr key={run.id} className="border-b transition-colors hover:bg-neutral-100/50 data-[state=selected]:bg-neutral-100 dark:hover:bg-dark-2 dark:data-[state=selected]:bg-neutral-800 border-[#eee] dark:border-dark-3">
                      <td className="p-4 align-middle min-w-[155px] xl:pl-7.5">
                        <h5 className="text-dark dark:text-white">Iteration #{run.iteration_number}</h5>
                        <p className="mt-[3px] text-xs text-dark-5 dark:text-dark-6">{run.id}</p>
                      </td>
                      <td className="p-4 align-middle">
                        <p className="text-dark dark:text-white">{formatDateTime(run.timestamp)}</p>
                      </td>
                      <td className="p-4 align-middle">
                        <div className={`max-w-fit rounded-full px-3.5 py-1 text-sm font-medium ${badgeBg} ${badgeText}`}>
                          {prettyStatus(run.status)}
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <p className="text-dark dark:text-white">{run.validation_score}</p>
                      </td>
                      <td className="p-4 align-middle xl:pr-7.5">
                        <div className="flex items-center justify-end gap-x-3.5">
                          <button className="hover:text-primary" aria-label="View Run">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                              <path d="M10 6.875a3.125 3.125 0 100 6.25 3.125 3.125 0 000-6.25zM8.123 10a1.875 1.875 0 113.75 0 1.875 1.875 0 01-3.75 0z"></path>
                              <path d="M10 2.708c-3.762 0-6.296 2.254-7.767 4.164l-.026.035c-.333.432-.64.83-.847 1.3C1.137 8.71 1.04 9.26 1.04 10s.096 1.29.319 1.793c.208.47.514.868.847 1.3l.026.034c1.47 1.911 4.005 4.165 7.766 4.165 3.762 0 6.296-2.254 7.766-4.165l.027-.034c.333-.432.639-.83.847-1.3.222-.504.319-1.053.319-1.793s-.097-1.29-.32-1.793c-.207-.47-.513-.868-.846-1.3l-.027-.035c-1.47-1.91-4.004-4.164-7.766-4.164zM3.223 7.635C4.582 5.87 6.79 3.958 9.999 3.958s5.418 1.913 6.776 3.677c.366.475.58.758.72 1.077.132.298.213.662.213 1.288s-.081.99-.213 1.288c-.14.319-.355.602-.72 1.077-1.358 1.764-3.568 3.677-6.776 3.677-3.208 0-5.417-1.913-6.775-3.677-.366-.475-.58-.758-.72-1.077-.132-.298-.213-.662-.213-1.288s.08-.99.212-1.288c.141-.319.355-.602.72-1.077z"></path>
                            </svg>
                          </button>
                          <button className="hover:text-primary" aria-label="Delete Run">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
                              <path fillRule="evenodd" clipRule="evenodd" d="M7.73202 1.68751H10.2681C10.4304 1.68741 10.5718 1.68732 10.7053 1.70864C11.2328 1.79287 11.6892 2.12186 11.9359 2.59563C11.9984 2.71555 12.043 2.84971 12.0942 3.00371L12.1779 3.25488C12.1921 3.2974 12.1962 3.30943 12.1996 3.31891C12.3309 3.682 12.6715 3.92745 13.0575 3.93723C13.0676 3.93748 13.08 3.93753 13.1251 3.93753H15.3751C15.6857 3.93753 15.9376 4.18937 15.9376 4.50003C15.9376 4.81069 15.6857 5.06253 15.3751 5.06253H2.625C2.31434 5.06253 2.0625 4.81069 2.0625 4.50003C2.0625 4.18937 2.31434 3.93753 2.625 3.93753H4.87506C4.9201 3.93753 4.93253 3.93749 4.94267 3.93723C5.32866 3.92745 5.66918 3.68202 5.80052 3.31893C5.80397 3.30938 5.80794 3.29761 5.82218 3.25488L5.90589 3.00372C5.95711 2.84973 6.00174 2.71555 6.06419 2.59563C6.3109 2.12186 6.76735 1.79287 7.29482 1.70864C7.42834 1.68732 7.56973 1.68741 7.73202 1.68751ZM6.75611 3.93753C6.79475 3.86176 6.82898 3.78303 6.85843 3.70161C6.86737 3.67689 6.87615 3.65057 6.88742 3.61675L6.96227 3.39219C7.03065 3.18706 7.04639 3.14522 7.06201 3.11523C7.14424 2.95731 7.29639 2.84764 7.47222 2.81957C7.50561 2.81423 7.55027 2.81253 7.76651 2.81253H10.2336C10.4499 2.81253 10.4945 2.81423 10.5279 2.81957C10.7037 2.84764 10.8559 2.95731 10.9381 3.11523C10.9537 3.14522 10.9695 3.18705 11.0379 3.39219L11.1127 3.61662L11.1417 3.70163C11.1712 3.78304 11.2054 3.86177 11.244 3.93753H6.75611Z"></path>
                              <path d="M4.43632 6.33761C4.41565 6.02764 4.14762 5.79311 3.83765 5.81377C3.52767 5.83444 3.29314 6.10247 3.31381 6.41245L3.6614 11.6262C3.72552 12.5883 3.77731 13.3654 3.89879 13.9752C4.02509 14.6092 4.23991 15.1387 4.6836 15.5538C5.1273 15.9689 5.66996 16.1481 6.31095 16.2319C6.92747 16.3126 7.70628 16.3125 8.67045 16.3125H9.32963C10.2938 16.3125 11.0727 16.3126 11.6892 16.2319C12.3302 16.1481 12.8728 15.9689 13.3165 15.5538C13.7602 15.1387 13.975 14.6092 14.1013 13.9752C14.2228 13.3654 14.2746 12.5883 14.3387 11.6263L14.6863 6.41245C14.707 6.10247 14.4725 5.83444 14.1625 5.81377C13.8525 5.79311 13.5845 6.02764 13.5638 6.33761L13.2189 11.5119C13.1515 12.5228 13.1034 13.2262 12.998 13.7554C12.8958 14.2688 12.753 14.5405 12.5479 14.7323C12.3429 14.9242 12.0623 15.0485 11.5433 15.1164C11.0082 15.1864 10.3032 15.1875 9.29007 15.1875H8.71005C7.69692 15.1875 6.99192 15.1864 6.45686 15.1164C5.93786 15.0485 5.65724 14.9242 5.45218 14.7323C5.24712 14.5405 5.10438 14.2687 5.00211 13.7554C4.89669 13.2262 4.84867 12.5228 4.78127 11.5119L4.43632 6.33761Z"></path>
                              <path d="M7.0691 7.69032C7.37822 7.65941 7.65387 7.88494 7.68478 8.19406L8.05978 11.9441C8.09069 12.2532 7.86516 12.5288 7.55604 12.5597C7.24692 12.5906 6.97127 12.3651 6.94036 12.056L6.56536 8.306C6.53445 7.99688 6.75998 7.72123 7.0691 7.69032Z"></path>
                              <path d="M10.931 7.69032C11.2402 7.72123 11.4657 7.99688 11.4348 8.306L11.0598 12.056C11.0289 12.3651 10.7532 12.5906 10.4441 12.5597C10.135 12.5288 9.90945 12.2532 9.94036 11.9441L10.3154 8.19406C10.3463 7.88494 10.6219 7.65941 10.931 7.69032Z"></path>
                            </svg>
                          </button>
                          <button className="hover:text-primary" aria-label="Download Run">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                              <path d="M10.461 13.755a.625.625 0 01-.922 0L6.205 10.11a.625.625 0 11.923-.843l2.247 2.457V2.5a.625.625 0 111.25 0v9.223l2.247-2.457a.625.625 0 01.923.843l-3.334 3.646z"></path>
                              <path d="M3.125 12.5a.625.625 0 10-1.25 0v.046c0 1.14 0 2.058.097 2.78.101.75.317 1.382.818 1.884.502.501 1.133.717 1.884.818.722.097 1.64.097 2.78.097h5.092c1.14 0 2.058 0 2.78-.097.75-.101 1.382-.317 1.884-.818.501-.502.717-1.134.818-1.884.097-.722.097-1.64.097-2.78V12.5a.625.625 0 10-1.25 0c0 1.196-.001 2.03-.086 2.66-.082.611-.233.935-.463 1.166-.23.23-.555.38-1.166.463-.63.085-1.464.086-2.66.086h-5c-1.196 0-2.03-.001-2.66-.086-.611-.082-.935-.233-1.166-.463-.085-.63-.086-1.464-.086-2.66z"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {runs.length === 0 ? (
                  <tr>
                    <td className="p-4 text-sm text-dark-5 dark:text-dark-6" colSpan={5}>No runs yet for this session.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {session.notes ? (
          <div className="col-span-12 rounded-[10px] bg-white p-6 shadow-1 dark:bg-gray-dark dark:shadow-card">
            <h3 className="mb-2 text-lg font-semibold text-dark dark:text-white">Notes</h3>
            <p className="whitespace-pre-wrap text-sm text-dark dark:text-white">{session.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
