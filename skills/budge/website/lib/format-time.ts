export const formatTime = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  // Keep replay timestamps compact and easy to scan.
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};
