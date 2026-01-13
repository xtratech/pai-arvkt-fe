"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    alpha: number;
    originalAlpha: number;
    density: number;
}

export function ParticleCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { resolvedTheme } = useTheme();

    // Use a ref to track if we've initialized for the current theme
    const themeRef = useRef(resolvedTheme);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;
        let particles: Particle[] = [];
        let animationFrameId: number;

        const mouse = {
            x: -1000,
            y: -1000,
            radius: 200, // Interaction radius
        };

        const handleMouseMove = (event: MouseEvent) => {
            // Get canvas position to ensure accurate coordinates relative to the viewport
            const rect = canvas.getBoundingClientRect();
            mouse.x = event.clientX - rect.left;
            mouse.y = event.clientY - rect.top;
        };

        const resize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            initParticles();
        };

        const initParticles = () => {
            particles = [];
            const particleCount = Math.floor((width * height) / 12000); // Increased density for better network effect
            const isDark = resolvedTheme === "dark";

            for (let i = 0; i < particleCount; i++) {
                const x = Math.random() * width;
                const y = Math.random() * height;

                const color = isDark
                    ? Math.random() > 0.6
                        ? "255, 255, 92" // Yellow (#FFFF5C)
                        : Math.random() > 0.5
                            ? "169, 240, 15" // Lime (#A9F00F)
                            : "167, 139, 250" // Violet
                    : "15, 23, 42"; // Slate-900

                const alpha = Math.random() * (isDark ? 0.6 : 0.3) + 0.1;
                const size = Math.random() * (isDark ? 2.5 : 2.0) + 1; // Slightly larger particles

                particles.push({
                    x,
                    y,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    size,
                    color,
                    alpha,
                    originalAlpha: alpha,
                    density: (Math.random() * 20) + 1, // Determines how fast they react to mouse
                });
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, width, height);

            particles.forEach((p) => {
                // --- 1. Physics Update ---
                p.x += p.vx;
                p.y += p.vy;

                // --- 2. Mouse Interaction (Antigravity) ---
                const dx = mouse.x - p.x;
                const dy = mouse.y - p.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < mouse.radius) {
                    // Calculate force direction (vector from particle to mouse)
                    const forceDirectionX = dx / distance;
                    const forceDirectionY = dy / distance;

                    // Calculate force magnitude (stronger when closer)
                    const force = (mouse.radius - distance) / mouse.radius;

                    // Apply repulsion (move AWAY from mouse)
                    // Multiplied by density to give varying weights to particles
                    const directionX = forceDirectionX * force * p.density;
                    const directionY = forceDirectionY * force * p.density;

                    p.x -= directionX;
                    p.y -= directionY;
                }

                // --- 3. Draw Connections (Neural Lines) ---
                // Only draw lines if reasonably close to mouse to simulate "activating" the network
                if (distance < mouse.radius) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(mouse.x, mouse.y);
                    // Opacity is inversely proportional to distance
                    const opacity = (1 - distance / mouse.radius) * 0.6;
                    ctx.strokeStyle = `rgba(${p.color}, ${opacity})`;
                    ctx.lineWidth = 0.6;
                    ctx.stroke();
                }

                // --- 4. Boundary Wrap ---
                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                // --- 5. Draw Particle ---
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
                ctx.fill();

                // Glow effect
                if (resolvedTheme === "dark") {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = `rgba(${p.color}, 0.5)`;
                } else {
                    ctx.shadowBlur = 0;
                }
            });

            ctx.shadowBlur = 0; // Reset for performance/next frame
            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener("resize", resize);
        window.addEventListener("mousemove", handleMouseMove);

        resize();
        draw();

        return () => {
            window.removeEventListener("resize", resize);
            window.removeEventListener("mousemove", handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [resolvedTheme]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 -z-0 pointer-events-none h-full w-full opacity-60"
            aria-hidden="true"
        />
    );
}
