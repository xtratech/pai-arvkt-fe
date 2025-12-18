'use client';

// src/components/icons/SendIcon.js
import React from 'react';

const SendIcon = ({ enabled }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`transition-all duration-200 ease-in-out ${enabled ? 'text-[var(--signature-lilac)]' : 'text-gray-400'}`}
  >
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

export default SendIcon;
