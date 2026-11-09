import React from 'react';

/**
 * Fibre bundles: a sheaf of streamlines fanning out of a common stem, the way
 * a tractography result is conventionally drawn. Used by both DTI entries.
 */
export const FiberIcon = props => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    {...props}
  >
    <path d="M3 20c3.5 0 5-2.5 6-6s2.5-8 6-8" />
    <path d="M4.5 21c3.5-.5 5.5-3 7-7s3-8 6.5-8.5" />
    <path d="M7 21.5c3-1.5 5-4 6.5-8S17 6 20.5 6.5" />
    <circle cx="20" cy="5" r="1.6" />
    <circle cx="3.4" cy="20.6" r="1.6" />
  </svg>
);

export default FiberIcon;
