"use client";

import {
    motion,
    useMotionTemplate,
    useMotionValue,
    useScroll,
    useSpring,
    useTransform,
} from "framer-motion";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { ParticleCanvas } from "./particle-canvas";

// --- Data ---

const features = [
    {
        title: "Prompts & Config",
        description:
            "Tune system prompts, LLM settings, and thinking levels for specific profiles like Analyst or Creator.",
        icon: (
            <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
                />
            </svg>
        ),
    },
    {
        title: "Knowledge Base",
        description:
            "Searchable articles with smart conflict detection. The Wizard drafts, validates, and safeguards your data.",
        icon: (
            <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                />
            </svg>
        ),
    },
    {
        title: "Training Loop",
        description:
            "Dedicated chat editors with token tracking and feedback loops. Train your agents explicitly with live status.",
        icon: (
            <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
            </svg>
        ),
    },
];

const stats = [
    { label: "Core Pillars", value: "3" },
    { label: "Profiles", value: "4" },
    { label: "Safeguards", value: "4" },
];

// --- Components ---

function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    const isDark = resolvedTheme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="group relative flex h-9 gap-2 overflow-hidden rounded-full border border-black/5 bg-white/40 px-1 py-1 backdrop-blur-md transition-colors hover:border-black/20 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
            aria-label="Toggle Theme"
        >
            <div className="relative z-10 flex h-full w-full items-center justify-between gap-2 px-2">
                <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ${!isDark ? "bg-white text-black shadow-sm" : "text-slate-400"
                        }`}
                >
                    <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                    </svg>
                </span>
                <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ${isDark ? "bg-white text-black shadow-sm" : "text-slate-500"
                        }`}
                >
                    <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
                        />
                    </svg>
                </span>
            </div>
        </button>
    );
}

function GridBackground() {
    return (
        <div className="pointer-events-none absolute inset-0 -z-30 h-full w-full overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-neon-yellow/20 blur-[100px] dark:bg-neon-yellow/10"></div>
            <div className="absolute bottom-0 right-0 -z-10 h-[400px] w-[400px] rounded-full bg-soft-violet/20 blur-[120px] dark:bg-soft-violet/5"></div>
        </div>
    );
}

function MouseGlow() {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const handleMouseMove = (event: MouseEvent) => {
        const { clientX, clientY } = event;
        mouseX.set(clientX);
        mouseY.set(clientY);
    };

    useEffect(() => {
        window.addEventListener("mousemove", handleMouseMove as any);
        return () => window.removeEventListener("mousemove", handleMouseMove as any);
    }, []);

    const background = useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, rgba(34, 211, 238, 0.08), transparent 80%)`;

    return (
        <motion.div
            className="pointer-events-none absolute inset-0 -z-20 opacity-0 transition-opacity duration-300 group-hover:opacity-100 lg:opacity-100"
            style={{ background }}
        />
    );
}

// --- Main Component ---

export function LandingPage() {
    const { scrollY } = useScroll();
    const headerY = useTransform(scrollY, [0, 100], [0, -20]);
    const headerOpacity = useTransform(scrollY, [0, 100], [1, 0.9]);
    const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);
    const heroScale = useTransform(scrollY, [0, 300], [1, 0.95]);

    const [mounted, setMounted] = useState(false);
    const { resolvedTheme } = useTheme();

    useEffect(() => setMounted(true), []);

    const logoSrc =
        mounted && resolvedTheme === "light"
            ? "/images/logo/logo-dark.svg"
            : "/images/logo/logo.svg";

    return (
        <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-50 font-sans text-slate-900 selection:bg-neon-yellow/30 dark:bg-obsidian dark:text-slate-100">
            <GridBackground />
            <ParticleCanvas />
            <MouseGlow />

            {/* Navigation */}
            <motion.header
                style={{ y: headerY, opacity: headerOpacity }}
                className="fixed left-0 right-0 top-6 z-50 mx-auto w-full max-w-5xl px-4"
            >
                <div className="flex items-center justify-between rounded-full border border-white/40 bg-white/60 px-6 py-3 shadow-lg shadow-black/[0.03] backdrop-blur-xl dark:border-white/10 dark:bg-obsidian/70 dark:shadow-black/20">
                    <Link href="/" className="flex items-center gap-2">
                        <Image
                            src={logoSrc}
                            alt="Pluree.ai"
                            width={120}
                            height={32}
                            className="h-8 w-auto"
                            priority
                        />
                    </Link>
                    <nav className="flex items-center gap-4">
                        <ThemeToggle />
                        <Link
                            href="/auth/sign-in"
                            className="text-sm font-medium text-slate-600 transition-colors hover:text-black dark:text-slate-400 dark:hover:text-white"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/auth/sign-up"
                            className="group relative overflow-hidden rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-slate-900 dark:bg-white dark:text-black dark:hover:bg-slate-200"
                        >
                            <span className="relative z-10">Get Started</span>
                            <div className="absolute inset-0 -z-0 bg-gradient-to-r from-neon-yellow/50 to-soft-violet/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                        </Link>
                    </nav>
                </div>
            </motion.header>

            {/* Hero Section */}
            <section className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-20 text-center">
                <motion.div
                    style={{ opacity: heroOpacity, scale: heroScale }}
                    className="relative z-10 mx-auto max-w-4xl space-y-8"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="inline-flex items-center gap-2 rounded-full border border-teal-600/20 bg-teal-600/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-teal-700 dark:border-neon-yellow/30 dark:bg-neon-yellow/10 dark:text-neon-yellow"
                    >
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-600 opacity-75 dark:bg-neon-yellow"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600 dark:bg-neon-lime"></span>
                        </span>
                        System Online
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
                        className="bg-gradient-to-br from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-5xl font-bold tracking-tight text-transparent dark:from-white dark:via-slate-200 dark:to-slate-500 sm:text-7xl lg:text-8xl"
                    >
                        Control the AI <br />
                        <span className="text-slate-900 dark:text-white">Neural Loop.</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                        className="mx-auto max-w-2xl text-lg text-slate-600 dark:text-slate-400 sm:text-xl"
                    >
                        An advanced toolkit to design, test, and refine your AI agents.
                        Maintain total control over prompts, knowledge, and training data.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                        className="flex flex-wrap items-center justify-center gap-4"
                    >
                        <Link
                            href="/auth/sign-up"
                            className="relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border border-black/10 bg-white/70 px-8 py-4 text-sm font-semibold text-slate-900 shadow-xl shadow-neon-yellow/10 backdrop-blur-sm transition-transform hover:scale-105 active:scale-95 dark:border-white/10 dark:bg-white/10 dark:text-white dark:shadow-neon-yellow/5"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-neon-yellow/10 to-soft-violet/10 opacity-0 transition-opacity hover:opacity-100"></span>
                            Initialize Toolkit
                        </Link>
                        <Link
                            href="#features"
                            className="px-8 py-4 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                        >
                            Explore Modules
                        </Link>
                    </motion.div>
                </motion.div>

                {/* Scroll Indicator */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 1 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2"
                >
                    <div className="flex h-10 w-6 flex-col items-center justify-start rounded-full border-2 border-slate-300 p-1 dark:border-slate-700">
                        <motion.div
                            animate={{ y: [0, 12, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            className="h-2 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500"
                        />
                    </div>
                </motion.div>
            </section>

            {/* Stats Section */}
            <section className="relative z-20 mx-auto -mt-20 max-w-6xl px-4">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.8 }}
                    className="grid gap-6 rounded-3xl border border-white/50 bg-white/40 p-8 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-obsidian/60 dark:shadow-black/40 sm:grid-cols-3"
                >
                    {stats.map((stat, i) => (
                        <div
                            key={stat.label}
                            className="flex flex-col items-center justify-center gap-2 text-center"
                        >
                            <div className="font-mono text-5xl font-bold text-slate-900 dark:text-white">
                                {stat.value}
                            </div>
                            <div className="font-mono text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </motion.div>
            </section>

            {/* Features Showcase */}
            <section id="features" className="relative py-32">
                <div className="mx-auto max-w-6xl px-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-20 text-center"
                    >
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                            System Modules
                        </h2>
                        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
                            Core components designed for maximum efficiency.
                        </p>
                    </motion.div>

                    <div className="grid gap-8 lg:grid-cols-3">
                        {features.map((feature, idx) => (
                            <motion.div
                                key={feature.title}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1, duration: 0.6 }}
                                className="group relative overflow-hidden rounded-3xl border border-black/5 bg-white p-8 shadow-sm transition-all hover:border-neon-yellow/50 hover:shadow-2xl hover:shadow-neon-yellow/10 dark:border-white/10 dark:bg-white/5 dark:hover:border-neon-yellow/50"
                            >
                                <div className="absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 rounded-full bg-neon-yellow/10 blur-2xl transition-all group-hover:bg-neon-yellow/20"></div>

                                <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white">
                                    {feature.icon}
                                </div>

                                <h3 className="mb-3 text-xl font-bold text-slate-900 dark:text-white">
                                    {feature.title}
                                </h3>
                                <p className="text-slate-600 dark:text-slate-400">
                                    {feature.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative pb-32 pt-16">
                <div className="mx-auto max-w-4xl px-4 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="relative overflow-hidden rounded-[3rem] bg-slate-900 px-6 py-24 text-white dark:bg-white dark:text-black"
                    >
                        <div className="absolute inset-0 opacity-20">
                            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(68,255,255,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%] animate-[shimmer_3s_infinite_linear]"></div>
                        </div>

                        <div className="relative z-10 space-y-8">
                            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                                Ready to Upgrade?
                            </h2>
                            <p className="mx-auto max-w-2xl text-lg text-slate-300 dark:text-slate-600">
                                Join the future of AI management. Build, test, and deploy with confidence.
                            </p>
                            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                                <Link
                                    href="/auth/sign-up"
                                    className="rounded-full bg-neon-yellow px-8 py-4 text-sm font-bold text-slate-900 transition-transform hover:scale-105 active:scale-95 dark:bg-black dark:text-white"
                                >
                                    Start Now
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-200 bg-slate-50 py-12 dark:border-white/10 dark:bg-obsidian">
                <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 text-sm text-slate-500 dark:text-slate-400 sm:flex-row">
                    <p>© {new Date().getFullYear()} Pluree.ai. All rights reserved.</p>
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-neon-lime"></span>
                        <span>All Systems Operational</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
