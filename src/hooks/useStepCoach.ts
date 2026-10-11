import { useEffect, useState } from 'react';

export function useStepCoach(stepToken: number): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    setElapsedMs(0);

    const timer = window.setInterval(() => {
      setElapsedMs(Math.round(performance.now() - startedAt));
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [stepToken]);

  return elapsedMs;
}
