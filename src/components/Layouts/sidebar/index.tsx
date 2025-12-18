"use client";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { NAV_DATA } from "./data";
import { ArrowLeftIcon, ChevronUp } from "./icons";
import { MenuItem } from "./menu-item";
import { useSidebarContext } from "./sidebar-context";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { setIsOpen, isOpen, isMobile, toggleSidebar } = useSidebarContext();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [chatPromptOpen, setChatPromptOpen] = useState(false);
  const [chatPromptDestination, setChatPromptDestination] = useState<"/chat" | "/chat-editor">("/chat");
  const [chatSessionInput, setChatSessionInput] = useState("");
  const [chatPromptError, setChatPromptError] = useState<string | null>(null);

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) => (prev.includes(title) ? [] : [title]));

    // Uncomment the following line to enable multiple expanded items
    // setExpandedItems((prev) =>
    //   prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    // );
  };

  useEffect(() => {
    // Keep collapsible open, when it's subpage is active
    NAV_DATA.some((section) => {
      return section.items.some((item) => {
        return item.items.some((subItem) => {
          if (subItem.url === pathname) {
            if (!expandedItems.includes(item.title)) {
              toggleExpanded(item.title);
            }

            // Break the loop
            return true;
          }
        });
      });
    });
  }, [pathname]);

  const handleChatNavClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      destination: "/chat" | "/chat-editor",
    ) => {
      event.preventDefault();
      setChatPromptError(null);
      setChatSessionInput("");
      setChatPromptDestination(destination);
      setChatPromptOpen(true);
    },
    [],
  );

  const handleChatPromptSubmit = useCallback(() => {
    const trimmed = chatSessionInput.trim();
    if (!trimmed) {
      setChatPromptError("Please enter a session ID.");
      return;
    }
    setChatPromptOpen(false);
    setChatPromptError(null);
    router.push(`${chatPromptDestination}?session_id=${encodeURIComponent(trimmed)}`);
    if (isMobile) {
      setIsOpen(false);
    }
  }, [chatPromptDestination, chatSessionInput, isMobile, router, setIsOpen]);

  const handleChatPromptCancel = useCallback(() => {
    setChatPromptOpen(false);
    setChatPromptError(null);
  }, []);

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "max-w-[290px] overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200 ease-linear dark:border-gray-800 dark:bg-gray-dark",
          isMobile ? "fixed bottom-0 top-0 z-50" : "sticky top-0 h-screen",
          isOpen ? "w-full" : "w-0",
        )}
        aria-label="Main navigation"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <div className="flex h-full flex-col py-10 pl-[25px] pr-[7px]">
          <div className="relative pr-4.5">
            <Link
              href={"/"}
              onClick={() => isMobile && toggleSidebar()}
              className="px-0 py-2.5 min-[850px]:py-0"
            >
              <Logo />
            </Link>

            {isMobile && (
              <button
                onClick={toggleSidebar}
                className="absolute left-3/4 right-4.5 top-1/2 -translate-y-1/2 text-right"
              >
                <span className="sr-only">Close Menu</span>

                <ArrowLeftIcon className="ml-auto size-7" />
              </button>
            )}
          </div>

          {/* Navigation */}
          <div className="custom-scrollbar mt-6 flex-1 overflow-y-auto pr-3 min-[850px]:mt-10">
            {NAV_DATA.map((section) => (
              <div key={section.label} className="mb-6">
                <h2 className="mb-5 text-sm font-medium text-dark-4 dark:text-dark-6">
                  {section.label}
                </h2>

                <nav role="navigation" aria-label={section.label}>
                  <ul className="space-y-2">
                    {section.items.map((item) => (
                      <li key={item.title}>
                        {item.items.length ? (
                          <div>
                            <MenuItem
                              isActive={item.items.some(
                                ({ url }) => url === pathname,
                              )}
                              onClick={() => toggleExpanded(item.title)}
                            >
                              <item.icon
                                className="size-6 shrink-0"
                                aria-hidden="true"
                              />

                              <span>{item.title}</span>

                              <ChevronUp
                                className={cn(
                                  "ml-auto rotate-180 transition-transform duration-200",
                                  expandedItems.includes(item.title) &&
                                    "rotate-0",
                                )}
                                aria-hidden="true"
                              />
                            </MenuItem>

                            {expandedItems.includes(item.title) && (
                              <ul
                                className="ml-9 mr-0 space-y-1.5 pb-[15px] pr-0 pt-2"
                                role="menu"
                              >
                                {item.items.map((subItem) => (
                                  <li key={subItem.title} role="none">
                                    <MenuItem
                                      as="link"
                                      href={subItem.url}
                                      isActive={pathname === subItem.url}
                                    >
                                      <span>{subItem.title}</span>
                                    </MenuItem>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : (
                          (() => {
                            const href =
                              "url" in item
                                ? item.url + ""
                                : "/" +
                                  item.title.toLowerCase().split(" ").join("-");
                            const isChatItem = href === "/chat" || href === "/chat-editor";

                            return (
                              <MenuItem
                                className="flex items-center gap-3 py-3"
                                as="link"
                                href={href}
                                isActive={pathname === href}
                                onClick={
                                  isChatItem
                                    ? (event: React.MouseEvent<HTMLAnchorElement>) =>
                                        handleChatNavClick(event, href as "/chat" | "/chat-editor")
                                    : undefined
                                }
                              >
                                <item.icon
                                  className="size-6 shrink-0"
                                  aria-hidden="true"
                                />

                                <span>{item.title}</span>
                              </MenuItem>
                            );
                          })()
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {chatPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-dark">
            <h4 className="text-lg font-semibold text-dark dark:text-white">
              {chatPromptDestination === "/chat-editor" ? "Open Chat Editor" : "Open Chat Playground"}
            </h4>
            <p className="mt-3 text-sm text-dark-5 dark:text-dark-6">
              Enter a session ID to continue.
            </p>
            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-5 dark:text-dark-6">
                Session ID
              </label>
              <input
                type="text"
                value={chatSessionInput}
                onChange={(e) => setChatSessionInput(e.target.value)}
                className="w-full rounded-lg border border-stroke px-3 py-2 text-sm text-dark outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 dark:border-dark-3 dark:bg-dark-2 dark:text-white"
                placeholder="e.g. sess-001"
              />
              {chatPromptError ? (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {chatPromptError}
                </div>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-stroke px-4 py-2 text-xs font-semibold uppercase tracking-wide text-dark transition hover:shadow-sm dark:border-dark-3 dark:text-white"
                onClick={handleChatPromptCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleChatPromptSubmit}
                disabled={!chatSessionInput.trim()}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
