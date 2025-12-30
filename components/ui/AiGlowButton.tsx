"use client";

import React from "react";
import styles from "./AiGlowButton.module.css";

export type AiGlowButtonProps = {
  label?: string;
  thinkingLabel?: string;
  thinking?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  hideTentacles?: boolean;
};

export function AiGlowButton({
  label = "Ask AI",
  thinkingLabel = "Thinking",
  thinking = false,
  hideTentacles = false,
  onClick,
  disabled = false,
  className,
}: AiGlowButtonProps) {
  const [isHover, setIsHover] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);
  const [isFocus, setIsFocus] = React.useState(false);

  const wrapperClass = [
    styles.wrapper,
    isHover ? styles.isHover : "",
    isActive ? styles.isActive : "",
    isFocus ? styles.isFocus : "",
    thinking ? styles.isThinking : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClass}>
      {!hideTentacles && <div className={styles.light1} aria-hidden="true" />}
      {!hideTentacles && <div className={styles.light2} aria-hidden="true" />}

      <button
        type="button"
        className={styles.aiBtn}
        onClick={onClick}
        disabled={disabled}
        aria-busy={thinking || undefined}
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => {
          setIsHover(false);
          setIsActive(false);
        }}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        onFocus={() => setIsFocus(true)}
        onBlur={() => setIsFocus(false)}
      >
        <span className={styles.txt1}>{label}</span>
        <span className={styles.txt2}>{thinkingLabel}</span>
      </button>

      {!hideTentacles && (
        <svg
          className={styles.aiBg}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="70 70 160 160"
          width="300"
          height="300"
          aria-hidden="true"
          focusable="false"
        >
        <line className={styles.lineBg} x1="150" y1="143.58" x2="150" y2="97.31" />
        <line className={styles.lineBg} x1="157.98" y1="143.58" x2="157.98" y2="112.08" />
        <line className={styles.lineBg} x1="142.02" y1="143.58" x2="142.02" y2="118.08" />
        <line className={styles.lineBg} x1="130.05" y1="143.58" x2="130.05" y2="133.79" />
        <line className={styles.lineBg} x1="138.03" y1="143.58" x2="138.03" y2="131.83" />
        <line className={styles.lineBg} x1="146.01" y1="143.58" x2="146.01" y2="129.15" />
        <line className={styles.lineBg} x1="153.99" y1="143.58" x2="153.99" y2="129.15" />
        <line className={styles.lineBg} x1="161.97" y1="143.58" x2="161.97" y2="131.83" />
        <line className={styles.lineBg} x1="169.95" y1="143.58" x2="169.95" y2="133.79" />

        <path
          className={styles.lineBg}
          d="M126.06,143.58v-10.37c0-.72-.29-1.41-.8-1.92l-4.28-4.28c-.51-.51-.8-1.2-.8-1.92v-12.37"
        />
        <path
          className={styles.lineBg}
          d="M165.96,143.58v-18.37c0-.72.29-1.41.8-1.92l4.28-4.28c.51-.51.8-1.2.8-1.92v-14.37"
        />
        <path
          className={styles.lineBg}
          d="M173.94,143.58v-10.37c0-.72.29-1.41.8-1.92l4.28-4.28c.51-.51.8-1.2.8-1.92v-10.69"
        />
        <path
          className={styles.lineBg}
          d="M134.04,143.58v-20.37c0-.72-.29-1.41-.8-1.92l-4.28-4.28c-.51-.51-.8-1.2-.8-1.92v-9.37"
        />

        <line className={styles.lineBg} x1="176.04" y1="150" x2="217.32" y2="150" />
        <path
          className={styles.lineBg}
          d="M176.04,153.99h13.37c.72,0,1.41.29,1.92.8l4.28,4.28c.51.51,1.2.8,1.92.8h14.37"
        />
        <path
          className={styles.lineBg}
          d="M176.04,146.01h15.37c.72,0,1.41-.29,1.92-.8l4.28-4.28c.51-.51,1.2-.8,1.92-.8h9.37"
        />
        <line className={styles.lineBg} x1="123.96" y1="150" x2="82.68" y2="150" />
        <path
          className={styles.lineBg}
          d="M123.96,146.01h-13.37c-.72,0-1.41-.29-1.92-.8l-4.28-4.28c-.51-.51,1.2-.8,1.92-.8h-14.37"
        />
        <path
          className={styles.lineBg}
          d="M123.96,153.99h-15.37c-.72,0-1.41.29-1.92.8l-4.28,4.28c-.51.51-1.2.8-1.92.8h-9.37"
        />

        <line className={styles.lineBg} x1="150" y1="156.42" x2="150" y2="202.69" />
        <line className={styles.lineBg} x1="142.02" y1="156.42" x2="142.02" y2="187.92" />
        <line className={styles.lineBg} x1="157.98" y1="156.42" x2="157.98" y2="181.92" />
        <line className={styles.lineBg} x1="169.95" y1="156.42" x2="169.95" y2="166.21" />
        <line className={styles.lineBg} x1="161.97" y1="156.42" x2="161.97" y2="168.17" />
        <line className={styles.lineBg} x1="153.99" y1="156.42" x2="153.99" y2="170.85" />
        <line className={styles.lineBg} x1="146.01" y1="156.42" x2="146.01" y2="170.85" />
        <line className={styles.lineBg} x1="138.03" y1="156.42" x2="138.03" y2="168.17" />
        <line className={styles.lineBg} x1="130.05" y1="156.42" x2="130.05" y2="166.21" />

        <path
          className={styles.lineBg}
          d="M173.94,156.42v10.37c0,.72.29,1.41.8,1.92l4.28,4.28c.51.51.8,1.2.8,1.92v12.37"
        />
        <path
          className={styles.lineBg}
          d="M134.04,156.42v18.37c0,.72-.29,1.41-.8,1.92l-4.28,4.28c-.51.51-.8,1.2-.8,1.92v14.37"
        />
        <path
          className={styles.lineBg}
          d="M126.06,156.42v10.37c0,.72-.29,1.41-.8,1.92l-4.28,4.28c-.51.51-.8,1.2-.8,1.92v10.69"
        />
        <path
          className={styles.lineBg}
          d="M165.96,156.42v20.37c0,.72.29,1.41.8,1.92l4.28,4.28c.51.51.8,1.2.8,1.92v9.37"
        />

        <circle className={styles.dot} cx="150" cy="96.13" r="1.17" />
        <circle className={styles.dot} cx="157.98" cy="110.91" r="1.17" />
        <circle className={styles.dot} cx="142.02" cy="116.91" r="1.17" />
        <circle className={styles.dot} cx="157.98" cy="183.09" r="1.17" />
        <circle className={styles.dot} cx="171.83" cy="101.54" r="1.17" />
        <circle className={styles.dot} cx="179.81" cy="113.23" r="1.17" />
        <circle className={styles.dot} cx="128.17" cy="104.54" r="1.17" />
        <circle className={styles.dot} cx="120.19" cy="111.54" r="1.17" />
        <circle className={styles.dot} cx="150" cy="203.87" r="1.17" />
        <circle className={styles.dot} cx="142.02" cy="189.09" r="1.17" />
        <circle className={styles.dot} cx="128.17" cy="198.46" r="1.17" />
        <circle className={styles.dot} cx="120.19" cy="186.77" r="1.17" />
        <circle className={styles.dot} cx="171.83" cy="195.46" r="1.17" />
        <circle className={styles.dot} cx="179.81" cy="188.46" r="1.17" />
        <circle className={styles.dot} cx="210.08" cy="140.14" r="1.17" />
        <circle className={styles.dot} cx="218.49" cy="150" r="1.17" />
        <circle className={styles.dot} cx="213.08" cy="159.86" r="1.17" />
        <circle className={styles.dot} cx="89.92" cy="159.86" r="1.17" />
        <circle className={styles.dot} cx="81.51" cy="150" r="1.17" />
        <circle className={styles.dot} cx="86.92" cy="140.14" r="1.17" />
        </svg>
      )}
    </div>
  );
}
